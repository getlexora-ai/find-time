"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Confirm-before-destroy pattern — reserved for the one class of destructive
 * action PLAN.md §9 axis 7 calls out as an exception to undo (account
 * disconnect/deletion). Every other destroy uses an undo toast instead.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="border border-ember/30 bg-ember/10 text-ember-200 hover:bg-ember/20"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="font-mono text-sm text-white/70">{message}</p>
    </Modal>
  );
}
