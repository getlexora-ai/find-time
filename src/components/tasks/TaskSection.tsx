import { Card } from "@/components/ui/Card";
import { TaskRow } from "@/components/tasks/TaskRow";
import type { Project, Task } from "@/lib/types";

export function TaskSection({
  label,
  tasks,
  projectsById,
}: {
  label: string;
  tasks: Task[];
  projectsById: Map<string, Project>;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <p className="font-mono text-xs uppercase tracking-widest text-white/50">{label}</p>
        <span className="font-mono text-micro text-white/30">{String(tasks.length).padStart(2, "0")}</span>
      </div>
      <Card tone="paper" className="divide-y divide-ink/10 p-0">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} project={task.projectId ? projectsById.get(task.projectId) : null} />
        ))}
      </Card>
    </div>
  );
}
