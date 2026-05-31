import { redirect } from 'next/navigation';

export default async function ProjectSpecForgePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/console/projects/${projectId}/codingcto`);
}
