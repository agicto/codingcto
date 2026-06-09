export interface TaskEventSummary {
  hasRuntimeClaim: boolean;
  hasExecutorResult: boolean;
  outputEventCount: number;
  errorEventCount: number;
  lastEventLabel: string;
  proofLabel: string;
}

export interface TaskEventEvidence {
  seq: number;
  type: string;
  output?: string;
}

export function summarizeTaskEvents(events: TaskEventEvidence[]): TaskEventSummary {
  const normalizedTypes = events.map(event => event.type.trim().toLowerCase());
  const hasRuntimeClaim = normalizedTypes.includes('runtime_claimed');
  const hasExecutorResult = normalizedTypes.includes('executor_result');
  const outputEventCount = events.filter(event => isOutputEvent(event)).length;
  const errorEventCount = events.filter(event => isErrorEvent(event)).length;
  const lastEvent = events.slice().sort((a, b) => a.seq - b.seq).at(-1);
  const proofLabel = hasExecutorResult
    ? '已有执行结果'
    : hasRuntimeClaim
      ? '已领取，等待结果'
      : events.length > 0
        ? '已有事件'
        : '等待事件';

  return {
    hasRuntimeClaim,
    hasExecutorResult,
    outputEventCount,
    errorEventCount,
    lastEventLabel: lastEvent ? `${lastEvent.seq}: ${lastEvent.type}` : '暂无',
    proofLabel,
  };
}

function isOutputEvent(event: TaskEventEvidence) {
  const type = event.type.trim().toLowerCase();
  return type.includes('stdout') || type.includes('output') || Boolean(event.output?.trim());
}

function isErrorEvent(event: TaskEventEvidence) {
  const type = event.type.trim().toLowerCase();
  return type.includes('stderr') || type.includes('error') || type.includes('failed');
}
