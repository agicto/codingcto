export type WorkItemID =
  | 'orchestration'
  | 'delivery'
  | 'intake'
  | 'wiki'
  | 'plan'
  | 'dag'
  | 'run'
  | 'review'
  | 'context';

export function workItemFromBoardParam(value: string | null): WorkItemID | undefined {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'intake':
      return 'intake';
    case 'context':
      return 'context';
    case 'wiki':
    case 'repo-wiki':
    case 'knowledge':
      return 'wiki';
    case 'delivery':
    case 'board':
    case 'pr':
    case 'pull-request':
    case 'pull-requests':
      return 'delivery';
    case 'plan':
      return 'plan';
    case 'prompt':
    case 'dag':
      return 'dag';
    case 'run':
    case 'execution':
    case 'tasks':
      return 'run';
    case 'review':
    case 'quality':
    case 'qa':
      return 'review';
    case 'manual':
    case 'orchestration':
      return 'orchestration';
    default:
      return undefined;
  }
}

export function boardParamFromWorkItem(item: WorkItemID) {
  switch (item) {
    case 'orchestration':
      return 'manual';
    case 'delivery':
      return 'delivery';
    case 'wiki':
      return 'wiki';
    case 'dag':
      return 'prompt';
    case 'run':
      return 'run';
    default:
      return item;
  }
}
