export default async function Page({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <div className="p-8 text-sm text-white/60">
      <p className="uppercase tracking-widest text-xs text-lime">AI Session</p>
      <p className="mt-2">Placeholder — built in a later phase. sessionId = {sessionId}</p>
    </div>
  );
}
