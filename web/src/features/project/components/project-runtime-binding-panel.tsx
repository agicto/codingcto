'use client';

import { FormEvent, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/http/request';
import {
  useCreateProjectRuntimeBinding,
  useProjectRuntimeBindings,
  useUpdateProjectRuntimeBinding,
} from '@/features/project/hooks/use-projects';
import type {
  ProjectContextDTO,
  ProjectRuntimeBindingStatusDTO,
} from '@/features/project/services/project-service';
import { useSpecForgeRuntimes } from '@/features/specforge/hooks/use-specforge';
import { deriveRuntimeHealth, runtimeFromDTO } from '@/features/specforge/runtime-health';

type RuntimeBindingFormState = {
  runtimeId: string;
  repoDir: string;
};

function emptyRuntimeBindingForm(): RuntimeBindingFormState {
  return {
    runtimeId: '',
    repoDir: '',
  };
}

function projectRuntimeBindingForm(
  binding: ProjectRuntimeBindingStatusDTO | null
): RuntimeBindingFormState {
  if (!binding) {
    return emptyRuntimeBindingForm();
  }
  return {
    runtimeId: binding.binding.runtime_id ?? '',
    repoDir: binding.binding.repo_dir ?? '',
  };
}

function runtimeHealthBadgeClass(health: string) {
  switch (health) {
    case 'online':
      return 'border-success/30 text-success';
    case 'recently_lost':
      return 'border-primary/30 text-primary';
    default:
      return 'border-warning/30 text-warning';
  }
}

function runtimeHealthLabel(health: string) {
  switch (health) {
    case 'online':
      return 'Online';
    case 'recently_lost':
      return 'Recently lost';
    case 'offline':
      return 'Offline';
    default:
      return 'Stale';
  }
}

export function ProjectRuntimeBindingPanel({ context }: { context: ProjectContextDTO }) {
  const projectId = context.project.id;
  const bindingsQuery = useProjectRuntimeBindings(projectId);
  const createBinding = useCreateProjectRuntimeBinding(projectId);
  const updateBinding = useUpdateProjectRuntimeBinding(projectId);
  const runtimesQuery = useSpecForgeRuntimes({ limit: 20 });
  const activeBinding =
    bindingsQuery.data?.bindings?.find(candidate => candidate.binding.active) ??
    bindingsQuery.data?.bindings?.[0] ??
    null;
  const panelKey = activeBinding
    ? `${activeBinding.binding.id}:${activeBinding.binding.updated_at}`
    : 'empty';

  return (
    <ProjectRuntimeBindingForm
      key={panelKey}
      context={context}
      binding={activeBinding}
      bindingsQueryError={bindingsQuery.isError}
      createBinding={createBinding}
      updateBinding={updateBinding}
      runtimes={runtimesQuery.data?.runtimes ?? []}
      runtimesQueryError={runtimesQuery.isError}
    />
  );
}

function ProjectRuntimeBindingForm({
  context,
  binding,
  bindingsQueryError,
  createBinding,
  updateBinding,
  runtimes,
  runtimesQueryError,
}: {
  context: ProjectContextDTO;
  binding: ProjectRuntimeBindingStatusDTO | null;
  bindingsQueryError: boolean;
  createBinding: ReturnType<typeof useCreateProjectRuntimeBinding>;
  updateBinding: ReturnType<typeof useUpdateProjectRuntimeBinding>;
  runtimes: NonNullable<ReturnType<typeof useSpecForgeRuntimes>['data']>['runtimes'];
  runtimesQueryError: boolean;
}) {
  const [form, setForm] = useState<RuntimeBindingFormState>(() =>
    projectRuntimeBindingForm(binding)
  );
  const [message, setMessage] = useState('');
  const primaryRepositoryId = context.primary_repository_id ?? '';
  const runtimeOptions = useMemo(() => runtimes.map(runtimeFromDTO), [runtimes]);
  const [runtimeNow] = useState(() => Date.now());
  const selectedRuntime =
    runtimeOptions.find(runtime => runtime.runtimeId === form.runtimeId) ??
    (binding?.runtime ? runtimeFromDTO(binding.runtime) : undefined);
  const selectedRuntimeHealth = selectedRuntime
    ? deriveRuntimeHealth(selectedRuntime, runtimeNow)
    : null;
  const saving = createBinding.isPending || updateBinding.isPending;
  const canSubmit =
    Boolean(primaryRepositoryId) && Boolean(form.runtimeId.trim()) && Boolean(form.repoDir.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!primaryRepositoryId) {
      setMessage('Bind a primary repository before saving a runtime binding.');
      return;
    }

    const payload = {
      repository_id: primaryRepositoryId,
      runtime_id: form.runtimeId.trim(),
      repo_dir: form.repoDir.trim(),
    };

    try {
      const response = binding
        ? await updateBinding.mutateAsync({ bindingId: binding.binding.id, payload })
        : await createBinding.mutateAsync(payload);
      setForm(projectRuntimeBindingForm(response.binding));
      setMessage(`Runtime binding for ${response.binding.binding.runtime_id} is now active.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? `Runtime binding save failed: ${error.message}`
          : 'Runtime binding save failed.'
      );
    }
  }

  return (
    <Card id="runtime-binding" className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">Runtime binding</CardTitle>
            <CardDescription className="mt-1">
              Run ccto up locally. CodingCTO can auto-detect matching GitHub repositories; this
              manual binding remains available for advanced overrides.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                binding?.eligible
                  ? 'border-success/30 text-success'
                  : 'border-warning/30 text-warning'
              }
            >
              {binding ? (binding.eligible ? 'Eligible' : 'Needs attention') : 'Missing'}
            </Badge>
            {selectedRuntimeHealth ? (
              <Badge variant="outline" className={runtimeHealthBadgeClass(selectedRuntimeHealth)}>
                {runtimeHealthLabel(selectedRuntimeHealth)}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="runtime-binding-repository">Primary repository</Label>
              <Input
                id="runtime-binding-repository"
                value={primaryRepositoryId || 'No primary repository'}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime-binding-runtime">Runtime</Label>
              <Select
                value={form.runtimeId}
                onValueChange={value => {
                  const runtime = runtimeOptions.find(option => option.runtimeId === value);
                  const matchedRepository = runtime?.repositories?.find(
                    repository => repository.repositoryId === primaryRepositoryId
                  );
                  setForm(current => ({
                    ...current,
                    runtimeId: value,
                    repoDir: matchedRepository?.repoDir || current.repoDir,
                  }));
                }}
              >
                <SelectTrigger id="runtime-binding-runtime">
                  <SelectValue placeholder="Select runtime" />
                </SelectTrigger>
                <SelectContent>
                  {runtimeOptions.map(runtime => {
                    const health = deriveRuntimeHealth(runtime, runtimeNow);
                    const detail = runtime.hostname
                      ? `${runtime.hostname} · ${runtime.executor}`
                      : runtime.executor;
                    return (
                      <SelectItem key={runtime.runtimeId} value={runtime.runtimeId}>
                        {runtime.runtimeId} - {detail} - {runtimeHealthLabel(health)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="runtime-binding-repo-dir">Repository directory</Label>
              <Input
                id="runtime-binding-repo-dir"
                value={form.repoDir}
                onChange={event =>
                  setForm(current => ({ ...current, repoDir: event.target.value }))
                }
                placeholder="/Users/mingde/item/codingcto"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-xs text-text-muted">Executor</div>
              <div className="mt-1 text-sm font-medium text-text-main">
                {selectedRuntime?.executor || binding?.binding.executor || 'Not selected'}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-xs text-text-muted">Hostname</div>
              <div className="mt-1 text-sm font-medium text-text-main">
                {selectedRuntime?.hostname || binding?.runtime?.hostname || 'Unknown'}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-xs text-text-muted">Writable sandbox</div>
              <div className="mt-1 text-sm font-medium text-text-main">
                {(selectedRuntime?.sandbox?.writable ?? binding?.runtime?.sandbox?.writable)
                  ? 'Yes'
                  : 'No / unknown'}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-xs text-text-muted">Last heartbeat</div>
              <div className="mt-1 text-sm font-medium text-text-main">
                {binding?.runtime?.last_seen_at
                  ? new Date(binding.runtime.last_seen_at).toLocaleString()
                  : 'Not observed'}
              </div>
            </div>
          </div>

          {selectedRuntime ? (
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-xs font-medium uppercase text-text-muted">
                Detected repositories
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {(selectedRuntime.repositories ?? []).length > 0 ? (
                  selectedRuntime.repositories?.slice(0, 4).map(repository => (
                    <div
                      key={`${repository.repositoryId}:${repository.repoDir}`}
                      className="rounded border border-border-subtle bg-bg-surface px-3 py-2"
                    >
                      <div className="truncate text-sm font-medium text-text-main">
                        {repository.repositoryId}
                      </div>
                      <div className="mt-1 truncate text-xs text-text-muted">
                        {repository.repoDir}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {repository.branch || 'detached'} - {repository.dirty ? 'dirty' : 'clean'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-text-muted">
                    No GitHub repositories reported yet. Run ccto up from the local repository root.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {binding?.warnings?.length ? (
            <div className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              {binding.warnings.map(warning => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          {!runtimeOptions.length ? (
            <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
              No runtimes have heartbeated yet. Start the local CodingCTO runtime worker first, then
              return here to bind it.
            </div>
          ) : null}
          {bindingsQueryError ? (
            <div className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              Existing runtime bindings could not be loaded. Saving a new binding is still
              available.
            </div>
          ) : null}
          {runtimesQueryError ? (
            <div className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              Runtime inventory could not be refreshed. Select from the last known runtime list or
              retry later.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? 'Saving' : binding ? 'Update runtime binding' : 'Save runtime binding'}
            </Button>
            {binding ? (
              <span className="text-xs text-text-muted">
                Last updated {new Date(binding.binding.updated_at).toLocaleString()}
              </span>
            ) : null}
          </div>

          {message ? (
            <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
              {message}
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
