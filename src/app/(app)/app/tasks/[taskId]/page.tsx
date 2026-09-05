import { TaskDetailView } from "@/components/tasks/TaskDetailView";

export default async function Page({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  return <TaskDetailView taskId={taskId} />;
}
