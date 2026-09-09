import { useCallback, useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/design/useReducedMotion';

import { DEMO, type AiResponseState } from './copy';

/**
 * The landing dashboard walkthrough — not in landing.html, added at the user's
 * request (German-learning demo on the mock planner). Owns the timeline; the two
 * mock cards read slices of the snapshot.
 *
 * At rest (SSR + first client render) the snapshot is REWOUND: the planner shows
 * its base day, the phone sits at "ask". When the hero first lays out on web
 * (`onEnterViewport`) it plays forward once to the finished state and stays.
 * Reduced-motion snaps to the finished state with no animation and never plays.
 *
 * ponytail: `onEnterViewport` is wired to the hero's `onLayout`, which for an
 * above-the-fold hero fires ~immediately — not a true IntersectionObserver.
 * Swap in an IO on the hero ref if the demo must wait for an actual scroll.
 */
export type DemoSnapshot = {
  /** what the phone input shows */
  typedPrompt: string;
  /** phone AI-response block state */
  responseState: AiResponseState;
  /** brief pulse on the phone send button as the request "submits" */
  sendPulse: boolean;
  /** how many of the AI-placed planner rows are in (0..DEMO.aiRows) */
  placed: number;
};

export type DemoState = DemoSnapshot & { onEnterViewport: () => void };

const CHAR_MS = 42;
const TYPE_AT = 500;
const TYPE_DUR = DEMO.prompt.length * CHAR_MS;
const SUBMIT_AT = TYPE_AT + TYPE_DUR + 160;
const THINK_AT = SUBMIT_AT + 220;
const ANSWER_AT = THINK_AT + 1200;
const PLACE1_AT = ANSWER_AT + 480;
const PLACE2_AT = PLACE1_AT + 760;

const REWOUND: DemoSnapshot = {
  typedPrompt: '',
  responseState: 'default',
  sendPulse: false,
  placed: 0,
};

const DONE: DemoSnapshot = {
  typedPrompt: DEMO.prompt,
  responseState: 'answered',
  sendPulse: false,
  placed: DEMO.aiRows,
};

export function useDemoSequence(): DemoState {
  const reduced = useReducedMotion();
  const [snap, setSnap] = useState<DemoSnapshot>(REWOUND);
  const started = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  // Fires from the hero's onLayout — i.e. after hydration, so moving off REWOUND
  // here (rather than during render) keeps SSR and first client render identical.
  const onEnterViewport = useCallback(() => {
    if (started.current) return;
    started.current = true;

    // reduced-motion: skip the walkthrough, snap to the finished day.
    if (reduced) {
      setSnap(DONE);
      return;
    }

    const patch = (p: Partial<DemoSnapshot>) => setSnap((s) => ({ ...s, ...p }));
    const push = (fn: () => void, at: number) => timers.current.push(setTimeout(fn, at));

    push(() => {
      let i = 0;
      const tick = () => {
        i += 1;
        patch({ typedPrompt: DEMO.prompt.slice(0, i) });
        if (i < DEMO.prompt.length) timers.current.push(setTimeout(tick, CHAR_MS));
      };
      tick();
    }, TYPE_AT);
    push(() => patch({ sendPulse: true }), SUBMIT_AT);
    push(() => patch({ sendPulse: false }), SUBMIT_AT + 220);
    push(() => patch({ responseState: 'thinking' }), THINK_AT);
    push(() => patch({ responseState: 'answered' }), ANSWER_AT);
    push(() => patch({ placed: 1 }), PLACE1_AT);
    push(() => patch({ placed: DEMO.aiRows }), PLACE2_AT);
  }, [reduced]);

  return { ...snap, onEnterViewport };
}
