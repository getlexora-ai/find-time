export default async function Page({
  params,
}: {
  params: Promise<{ signalId: string }>;
}) {
  const { signalId } = await params;
  return (
    <div className="p-8 text-sm text-white/60">
      <p className="uppercase tracking-widest text-xs text-lime">Signal Detail</p>
      <p className="mt-2">Placeholder — built in a later phase. signalId = {signalId}</p>
    </div>
  );
}
