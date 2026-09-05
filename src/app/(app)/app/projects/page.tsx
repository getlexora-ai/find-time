"use client";

import * as React from "react";
import { useProjects } from "@/lib/hooks/useProjects";
import { useTasks } from "@/lib/hooks/useTasks";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { emptyStates } from "@/content/voice";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";

export default function ProjectsPage() {
  const { data: projects, isLoading } = useProjects();
  const { data: tasks } = useTasks();
  const [modalOpen, setModalOpen] = React.useState(false);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-lime">Projects</p>
          <h1 className="mt-1 font-mono text-2xl font-medium tracking-tight text-white">
            Group the work that matters
          </h1>
        </div>
        <Button size="sm" icon="solar:add-circle-linear" onClick={() => setModalOpen(true)}>
          New project
        </Button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!isLoading && (projects?.length ?? 0) === 0 && (
        <EmptyState
          icon={emptyStates.projects.icon}
          eyebrow={emptyStates.projects.eyebrow}
          message={emptyStates.projects.message}
          ctaLabel={emptyStates.projects.ctaLabel}
          onCta={() => setModalOpen(true)}
        />
      )}

      {!isLoading && (projects?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects!.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              tasks={(tasks ?? []).filter((t) => t.projectId === project.id)}
            />
          ))}
        </div>
      )}

      <ProjectFormModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
