const apiBase = (process.env.CODINGCTO_API_BASE_URL || 'http://localhost:2010/v1').replace(
  /\/$/,
  ''
);
const username = process.env.CODINGCTO_ADMIN_USERNAME || 'admin';
const password = process.env.CODINGCTO_ADMIN_PASSWORD || 'admin123';
const providedToken = process.env.CODINGCTO_ACCESS_TOKEN || '';

const expertSkills = [
  {
    id: 'smoke-product-requirements',
    name: 'Product Requirements Expert',
    description: 'Clarifies users, scope, acceptance criteria, non-goals, and open questions.',
    content:
      'Use this exact skill name in expert_skills: Product Requirements Expert. Define target users, in-scope and out-of-scope items, acceptance criteria, and unresolved product questions. Keep milestones reviewable as small PRs.',
    target_agents: ['planning'],
  },
  {
    id: 'smoke-architecture-impact',
    name: 'Architecture Impact Expert',
    description: 'Constrains module boundaries, API contracts, data flow, compatibility, and risks.',
    content:
      'Use this exact skill name in expert_skills: Architecture Impact Expert. Identify affected frontend features, API modules, data contracts, integration boundaries, compatibility risks, and migration constraints.',
    target_agents: ['planning'],
  },
  {
    id: 'smoke-qa-verification',
    name: 'QA Verification Expert',
    description: 'Defines test strategy, acceptance gates, failure modes, and manual checks.',
    content:
      'Use this exact skill name in expert_skills: QA Verification Expert. Attach tests, type checks, lint, browser checks, manual acceptance checks, and failure modes to each milestone.',
    target_agents: ['planning'],
  },
  {
    id: 'smoke-agent-handoff',
    name: 'Coding Agent Handoff Expert',
    description: 'Makes the plan executable by a coding agent with files, commands, and review gates.',
    content:
      'Use this exact skill name in expert_skills: Coding Agent Handoff Expert. Name likely files, expected edits, validation commands, sequencing, and review gates for a coding agent handoff.',
    target_agents: ['planning'],
  },
];

const payload = {
  idea:
    process.env.CODINGCTO_EXPERT_SMOKE_IDEA ||
    'Build an Expert sidebar where a user enters a product idea, combines it with expert skills, streams generation, and receives a final Markdown implementation plan for a coding agent.',
  mode: process.env.CODINGCTO_EXPERT_SMOKE_MODE || 'standard',
  repository: {
    repository_id: 'smoke-local',
    full_name: 'local/codingcto',
    default_branch: 'main',
  },
  skills: expertSkills,
};

const startedAt = performance.now();

function elapsedMs() {
  return Math.round(performance.now() - startedAt);
}

async function main() {
  const token = providedToken || (await login());
  const streamResponse = await fetch(`${apiBase}/experts/implementation-plan/stream`, {
    method: 'POST',
    headers: {
      accept: 'application/x-ndjson',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!streamResponse.ok) {
    throw new Error(`stream failed: ${streamResponse.status} ${await streamResponse.text()}`);
  }
  if (!streamResponse.body) {
    throw new Error('stream response has no body');
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  const timings = {};
  const countsByType = {};
  const phases = [];
  let buffer = '';
  let eventCount = 0;
  let argumentsBytes = 0;
  let result = null;

  async function handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    const event = JSON.parse(trimmed);
    eventCount += 1;
    countsByType[event.type] = (countsByType[event.type] || 0) + 1;
    if (!timings.first_event_ms) {
      timings.first_event_ms = elapsedMs();
    }
    if (event.type === 'tool_call' && !timings.first_tool_call_ms) {
      timings.first_tool_call_ms = elapsedMs();
    }
    if (event.type === 'tool_call' && event.phase === 'arguments' && !timings.first_arguments_ms) {
      timings.first_arguments_ms = elapsedMs();
    }
    if (event.type === 'progress' && !timings.first_progress_ms) {
      timings.first_progress_ms = elapsedMs();
    }
    if (typeof event.arguments_bytes === 'number') {
      argumentsBytes = Math.max(argumentsBytes, event.arguments_bytes);
    }
    if (event.phase || event.type) {
      phases.push(`${event.type}${event.phase ? `:${event.phase}` : ''}`);
    }
    if (event.type === 'error') {
      throw new Error(event.error || event.message || 'stream returned error');
    }
    if (event.type === 'result') {
      timings.result_ms = elapsedMs();
      result = event.response;
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      await handleLine(line);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    await handleLine(buffer);
  }

  if (!result) {
    throw new Error('stream finished without a result event');
  }

  const appliedSkillNames = (result.plan?.expert_skills || []).map(skill => skill.name);
  const skillCoverage = expertSkills.map(skill => ({
    name: skill.name,
    applied: appliedSkillNames.some(name => sameName(name, skill.name)),
  }));
  const usedFunctionCall =
    result.tool_call?.name === 'draft_implementation_plan' &&
    result.tool_call?.finish_reason === 'tool_calls';

  const summary = {
    ok: usedFunctionCall && skillCoverage.every(item => item.applied),
    used_function_call: usedFunctionCall,
    tool_call: result.tool_call,
    timings_ms: timings,
    event_count: eventCount,
    counts_by_type: countsByType,
    arguments_bytes: argumentsBytes,
    phase_sample: phases.slice(0, 8),
    model: result.model,
    skills_sent: expertSkills.map(skill => skill.name),
    skills_applied: appliedSkillNames,
    skill_coverage: skillCoverage,
    markdown_lines: String(result.markdown || '').split('\n').length,
    markdown_title: String(result.markdown || '').split('\n')[0] || '',
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!summary.ok) {
    process.exitCode = 1;
  }
}

async function login() {
  const response = await fetch(`${apiBase}/login`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`login failed: ${response.status} ${await response.text()}`);
  }
  const body = await response.json();
  const token = body?.data?.access_token || body?.access_token;
  if (!token) {
    throw new Error('login response did not include access_token');
  }
  return token;
}

function sameName(left, right) {
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
