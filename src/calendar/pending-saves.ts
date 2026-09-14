/**
 * Writes that arrived before the store could send them.
 *
 * A calendar event id only maps to a server id once a list fetch has succeeded
 * or a create has come back. Two ordinary situations break that:
 *
 *   - the store's first load runs at import, before AuthBridge has installed
 *     the Clerk token, so it 401s and the id map stays empty until a later
 *     refresh; and
 *   - a block created a moment ago is still waiting on its POST.
 *
 * `updateEvent` used to simply `return` in both cases: the screen changed,
 * nothing was sent, and the next refresh quietly put the old values back. This
 * holds the write until the id is known instead, and resolves the caller's
 * promise with what actually happened, so the UI can say so.
 *
 * Pure and import-free so the check harness can drive it.
 */

export type PendingOp<P> = { kind: 'patch'; patch: P } | { kind: 'delete' };

type Entry<P> = {
  op: PendingOp<P>;
  waiters: ((ok: boolean) => void)[];
  timer: ReturnType<typeof setTimeout> | null;
};

export type Taken<P> = {
  op: PendingOp<P>;
  /** Resolve every caller that queued a write for this id. */
  settle: (ok: boolean) => void;
};

/** Later writes win key by key; a delete wins over any patch, in either order. */
function merge<P extends object>(a: PendingOp<P>, b: PendingOp<P>): PendingOp<P> {
  if (a.kind === 'delete' || b.kind === 'delete') return { kind: 'delete' };
  return { kind: 'patch', patch: { ...a.patch, ...b.patch } };
}

export class PendingSaves<P extends object> {
  private readonly entries = new Map<number, Entry<P>>();
  // Plain fields rather than constructor parameter properties: node's type
  // stripping, which the check harness relies on, does not support those.
  private readonly timeoutMs: number;
  private readonly onExpire: (id: number) => void;

  /**
   * @param timeoutMs how long a write may wait for its id before it is reported
   *   failed. 0 disables the timeout. Without one, a write made while signed out
   *   would leave its caller waiting forever and never tell anyone it failed.
   * @param onExpire called after an entry times out, so the owner can put
   *   server truth back on screen.
   */
  constructor(timeoutMs: number, onExpire: (id: number) => void = () => {}) {
    this.timeoutMs = timeoutMs;
    this.onExpire = onExpire;
  }

  enqueue(id: number, op: PendingOp<P>): Promise<boolean> {
    return new Promise((resolve) => {
      const cur = this.entries.get(id);
      if (cur) {
        cur.op = merge(cur.op, op);
        cur.waiters.push(resolve);
        return;
      }
      const entry: Entry<P> = { op, waiters: [resolve], timer: null };
      if (this.timeoutMs > 0) entry.timer = setTimeout(() => this.expire(id), this.timeoutMs);
      this.entries.set(id, entry);
    });
  }

  has(id: number): boolean {
    return this.entries.has(id);
  }

  ids(): number[] {
    return [...this.entries.keys()];
  }

  /** Remove an entry to act on it. The caller must `settle` it. */
  take(id: number): Taken<P> | null {
    const e = this.entries.get(id);
    if (!e) return null;
    this.entries.delete(id);
    if (e.timer) clearTimeout(e.timer);
    return { op: e.op, settle: (ok) => e.waiters.forEach((w) => w(ok)) };
  }

  private expire(id: number): void {
    const t = this.take(id);
    if (!t) return;
    t.settle(false);
    this.onExpire(id);
  }
}
