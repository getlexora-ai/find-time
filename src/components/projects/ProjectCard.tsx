import Link from "next/link";
import { format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { ProgressMeter } from "@/components/ui/ProgressMeter";
import { Icon } from "@/components/ui/Icon";
import type { Project, Task } from "@/lib/types";

export function ProjectCard({ project, tasks }: { project: Project; tasks: Task[] }) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Link href={`/app/projects/${project.id}`}>
      <Card hoverLift className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: `var(--color-${project.color}, #CCFF00)` }}
            />
            <h3 className="font-mono text-base font-medium text-white">{project.name}</h3>
          </div>
          {project.status !== "active" && (
            <span className="font-mono text-micro uppercase tracking-wider text-white/40">{project.status}</span>
          )}
        </div>

        {project.description && <p className="line-clamp-2 font-mono text-xs text-white/55">{project.description}</p>}

        <div className="mt-auto flex flex-col gap-3">
          <ProgressMeter value={pct} label={`${done}/${total} done`} delta={total > 0 ? `${pct}%` : undefined} />
          {project.targetDate && (
            <div className="flex items-center gap-1.5 font-mono text-xs text-white/45">
              <Icon name="solar:calendar-minimalistic-linear" size={13} />
              Target {format(new Date(project.targetDate), "MMM d, yyyy")}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
