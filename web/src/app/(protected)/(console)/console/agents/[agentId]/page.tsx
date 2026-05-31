import { AgentsConsole } from '@/features/agents/components/agents-console';

interface AgentDetailPageProps {
  params: Promise<{ agentId: string }>;
}

export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { agentId } = await params;

  return <AgentsConsole selectedAgentId={decodeURIComponent(agentId)} />;
}
