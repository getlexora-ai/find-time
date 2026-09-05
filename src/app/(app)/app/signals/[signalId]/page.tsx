import { SignalDetailView } from "@/components/signals/SignalDetailView";

export default async function Page({
  params,
}: {
  params: Promise<{ signalId: string }>;
}) {
  const { signalId } = await params;
  return <SignalDetailView signalId={signalId} />;
}
