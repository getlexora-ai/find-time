export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="p-8 text-sm text-white/60">
      <p className="uppercase tracking-widest text-xs text-lime">Project Detail</p>
      <p className="mt-2">Placeholder — built in a later phase. projectId = {projectId}</p>
    </div>
  );
}
