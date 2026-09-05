"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useAcceptSignal, useIgnoreSignal } from "@/lib/hooks/useSignals";
import type { EmailSignal } from "@/lib/types";
import {
  acceptIcon,
  acceptLabel,
  confidencePct,
  confidenceTone,
  isSettled,
  kindLabel,
  settledStatusLabel,
} from "@/components/signals/signalUtils";

export function SignalCard({ signal, linkToDetail = true }: { signal: EmailSignal; linkToDetail?: boolean }) {
  const accept = useAcceptSignal();
  const ignore = useIgnoreSignal();
  const { push } = useToast();
  const settled = isSettled(signal);

  const onAccept = () => {
    accept.mutate(signal.id, {
      onSuccess: () => push({ message: "Task created from signal", variant: "success" }),
    });
  };
  const onIgnore = () => {
    ignore.mutate(signal.id, {
      onSuccess: () => push({ message: "Signal ignored", variant: "success" }),
    });
  };

  const body = (
    <Card className={cn("flex flex-col gap-3", settled && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60">
            <Icon name="solar:letter-linear" size={15} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm text-white">{signal.fromName}</p>
            <p className="truncate font-mono text-micro text-white/35">{signal.from}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone="outline">{kindLabel(signal.kind)}</Chip>
          <span className="font-mono text-micro text-white/35">
            {formatDistanceToNow(new Date(signal.receivedAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      <p className="font-mono text-sm text-white/85">{signal.subject}</p>

      <blockquote className="border-l-2 border-lime/60 pl-3 font-mono text-xs italic text-lime/90">
        “{signal.sourceQuote}”
      </blockquote>

      <div className="flex items-center gap-2 rounded-control border border-white/10 bg-white/[0.04] px-3 py-2">
        <Icon name="solar:magic-stick-3-linear" size={14} className="shrink-0 text-white/40" />
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-white/75">{signal.extractedTitle}</p>
        <Chip tone={confidenceTone(signal.confidence)}>{confidencePct(signal.confidence)}</Chip>
      </div>

      {settled ? (
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-white/40">
          <Icon
            name={signal.status === "ignored" ? "solar:close-circle-linear" : "solar:check-circle-linear"}
            size={14}
          />
          {settledStatusLabel(signal)}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button size="sm" icon={acceptIcon(signal)} onClick={onAccept} loading={accept.isPending}>
            {acceptLabel(signal)}
          </Button>
          <Button size="sm" variant="ghost" icon="solar:close-circle-linear" onClick={onIgnore} loading={ignore.isPending}>
            Ignore
          </Button>
        </div>
      )}
    </Card>
  );

  if (!linkToDetail) return body;

  return (
    <Link
      href={`/app/signals/${signal.id}`}
      className="block"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      {body}
    </Link>
  );
}
