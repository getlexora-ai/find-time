import type { EmailSignal, SignalKind } from "@/lib/types";

export const LOW_CONFIDENCE_THRESHOLD = 0.6;

type ChipTone = "lime" | "periwinkle" | "ember" | "amber" | "paper" | "outline";

export function confidenceTone(confidence: number): ChipTone {
  if (confidence >= 0.8) return "lime";
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return "amber";
  return "outline";
}

export function confidencePct(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function isLowConfidence(signal: EmailSignal): boolean {
  return signal.confidence < LOW_CONFIDENCE_THRESHOLD;
}

export function isSettled(signal: EmailSignal): boolean {
  return signal.status !== "new";
}

export function acceptLabel(signal: EmailSignal): string {
  return signal.kind === "meeting-request" ? "Schedule it" : "Make a task";
}

export function acceptIcon(signal: EmailSignal): string {
  return signal.kind === "meeting-request" ? "solar:calendar-add-linear" : "solar:check-circle-linear";
}

const KIND_LABEL: Record<SignalKind, string> = {
  commitment: "Commitment",
  deadline: "Deadline",
  "meeting-request": "Meeting request",
  task: "Task",
  "follow-up": "Follow-up",
  travel: "Travel",
  ignore: "Low signal",
};

export function kindLabel(kind: SignalKind): string {
  return KIND_LABEL[kind] ?? kind;
}

export function settledStatusLabel(signal: EmailSignal): string {
  switch (signal.status) {
    case "converted":
    case "accepted":
      return "Task created";
    case "ignored":
      return "Ignored";
    case "snoozed":
      return "Snoozed";
    default:
      return signal.status;
  }
}
