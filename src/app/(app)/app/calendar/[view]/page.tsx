export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  return (
    <div className="p-8 text-sm text-white/60">
      <p className="uppercase tracking-widest text-xs text-lime">Calendar</p>
      <p className="mt-2">Placeholder — built in a later phase. view = {view}</p>
    </div>
  );
}
