export default async function Page({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return (
    <div className="p-8 text-sm text-white/60">
      <p className="uppercase tracking-widest text-xs text-lime">Task Detail</p>
      <p className="mt-2">Placeholder — built in a later phase. taskId = {taskId}</p>
    </div>
  );
}
