import { ProjectDetailView } from "@/components/projects/ProjectDetailView";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectDetailView projectId={projectId} />;
}
