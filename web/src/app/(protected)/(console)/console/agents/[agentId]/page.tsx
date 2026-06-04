import { AgentsConsole } from '@/features/agents/components/agents-console';

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;

  return <AgentsConsole selectedAgentId={agentId} />;
}
