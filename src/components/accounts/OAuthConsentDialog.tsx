"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { ProviderMeta } from "@/components/accounts/providerMeta";

/**
 * Previews exactly what a connection will grant before the (simulated) OAuth redirect fires —
 * per PLAN.md §3.1, connecting an account always goes through this scope preview first.
 */
export function OAuthConsentDialog({
  open,
  onOpenChange,
  meta,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: ProviderMeta;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-blue-950/70 blur-scrim data-[state=open]:animate-toast-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2",
            "flex flex-col rounded-card border border-white/10 bg-ink shadow-panel focus:outline-none",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-control bg-white/10 text-white">
                <Icon name={meta.icon} size={18} />
              </span>
              <div>
                <Dialog.Title className="font-mono text-sm font-medium text-white">
                  Connect {meta.label}
                </Dialog.Title>
                <Dialog.Description className="font-mono text-xs text-white/45">
                  {meta.description}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <IconButton icon="solar:close-circle-linear" aria-label="Close" />
            </Dialog.Close>
          </div>

          <div className="flex-1 p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-white/40">
              Find_time will be able to
            </p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {meta.scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2.5 font-mono text-xs text-white/75">
                  <Icon name="solar:check-circle-linear" size={15} className="mt-0.5 shrink-0 text-lime" />
                  <span>{scope}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-micro text-white/35">
              This is a simulated connection — no real {meta.label} account is contacted.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
            <Dialog.Close asChild>
              <Button variant="quiet" size="sm">
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="sm" onClick={onConfirm}>
              Continue to {meta.label}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
