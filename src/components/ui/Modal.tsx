"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils/cn";
import { IconButton } from "@/components/ui/IconButton";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  sheet = false,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Bottom sheet on mobile, centered dialog on larger screens */
  sheet?: boolean;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-blue-950/70 blur-scrim data-[state=open]:animate-toast-in" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col bg-ink shadow-panel focus:outline-none",
            sheet
              ? "inset-x-0 bottom-0 max-h-[85vh] rounded-t-card border-t border-white/10 sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:border"
              : "left-1/2 top-1/2 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-card border border-white/10",
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <Dialog.Title className="font-mono text-xl font-medium text-white">
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton icon="solar:close-circle-linear" aria-label="Close" />
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && (
            <div className="border-t border-white/10 px-5 py-4">{footer}</div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
