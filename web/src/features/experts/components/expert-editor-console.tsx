'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  FileClock,
  History,
  Plus,
  Save,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  useCodingCTOExpertRuns,
  useCodingCTOExpertSkillVersions,
  useCodingCTOExpertSkills,
  useCodingCTOExperts,
  useCodingCTOSkillEvolutionProposals,
  useCreateCodingCTOSkillEvolutionProposal,
  useUpsertCodingCTOExpert,
  useUpsertCodingCTOExpertSkill,
} from '@/features/experts/hooks/use-experts';
import type {
  CodingCTOExpertDTO,
  CodingCTOExpertSkillDTO,
} from '@/features/experts/services/experts-service';
import { cn } from '@/utils';

const emptyExpertForm = {
  key: '',
  name: '',
  role: 'product',
  description: '',
  systemPrompt: '',
  active: true,
};

function expertToForm(expert: CodingCTOExpertDTO) {
  return {
    key: expert.key,
    name: expert.name,
    role: expert.role,
    description: expert.description,
    systemPrompt: expert.system_prompt,
    active: expert.active,
  };
}

const emptySkillForm = {
  name: '',
  description: '',
  content: '',
  proposal: '',
  rationale: '',
};

function skillToForm(skill: CodingCTOExpertSkillDTO) {
  return {
    name: skill.name,
    description: skill.description,
    content: skill.current_version?.content ?? '',
    proposal: '',
    rationale: '',
  };
}

export function ExpertEditorConsole() {
  const expertsQuery = useCodingCTOExperts(false);
  const experts = useMemo(() => expertsQuery.data?.experts ?? [], [expertsQuery.data?.experts]);
  const [selectedExpertId, setSelectedExpertId] = useState<number | undefined>();
  const [selectedSkillId, setSelectedSkillId] = useState<number | undefined>();
  const [isCreatingExpert, setIsCreatingExpert] = useState(false);
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [expertForm, setExpertForm] = useState(emptyExpertForm);
  const [skillForm, setSkillForm] = useState(emptySkillForm);
  const [message, setMessage] = useState('');

  const selectedExpert =
    experts.find(expert => expert.id === selectedExpertId) ??
    (isCreatingExpert ? undefined : experts[0]);
  const skillsQuery = useCodingCTOExpertSkills(selectedExpert?.id);
  const skills = skillsQuery.data?.skills ?? [];
  const selectedSkill =
    isCreatingSkill ? undefined : skills.find(skill => skill.id === selectedSkillId) ?? skills[0];
  const effectiveSkillId = selectedSkill?.id;
  const versionsQuery = useCodingCTOExpertSkillVersions(effectiveSkillId);
  const versions = useMemo(
    () => versionsQuery.data?.versions ?? [],
    [versionsQuery.data?.versions]
  );
  const proposalsQuery = useCodingCTOSkillEvolutionProposals(effectiveSkillId);
  const proposals = proposalsQuery.data?.proposals ?? [];
  const runsQuery = useCodingCTOExpertRuns(selectedExpert?.id);
  const runs = runsQuery.data?.runs ?? [];
  const upsertExpert = useUpsertCodingCTOExpert();
  const upsertSkill = useUpsertCodingCTOExpertSkill(selectedExpert?.id);
  const createProposal = useCreateCodingCTOSkillEvolutionProposal(effectiveSkillId);

  const activeExperts = experts.filter(expert => expert.active).length;
  const expertDraft =
    selectedExpert && !isCreatingExpert && !selectedExpertId ? expertToForm(selectedExpert) : expertForm;
  const skillDraft =
    selectedSkill && !isCreatingSkill && !selectedSkillId ? skillToForm(selectedSkill) : skillForm;
  const latestVersion = useMemo(() => versions[0], [versions]);
  const pendingProposalCount = proposals.filter(
    proposal => proposal.status === 'pending_review'
  ).length;

  function startNewExpert() {
    setIsCreatingExpert(true);
    setSelectedExpertId(undefined);
    setSelectedSkillId(undefined);
    setExpertForm(emptyExpertForm);
    setSkillForm(emptySkillForm);
    setActiveTab('profile');
    setMessage('');
  }

  function editExpert(expert: CodingCTOExpertDTO) {
    setIsCreatingExpert(false);
    setSelectedExpertId(expert.id);
    setSelectedSkillId(undefined);
    setIsCreatingSkill(false);
    setExpertForm(expertToForm(expert));
    setSkillForm(emptySkillForm);
    setActiveTab('profile');
    setMessage('');
  }

  function updateExpertField(field: keyof typeof emptyExpertForm, value: string | boolean) {
    if (selectedExpert && !selectedExpertId && !isCreatingExpert) {
      setSelectedExpertId(selectedExpert.id);
      setExpertForm({ ...expertToForm(selectedExpert), [field]: value });
      return;
    }
    setExpertForm(form => ({ ...form, [field]: value }));
  }

  function editSkill(skill: CodingCTOExpertSkillDTO) {
    setIsCreatingSkill(false);
    setSelectedSkillId(skill.id);
    setSkillForm(skillToForm(skill));
    setMessage('');
  }

  function startNewSkill() {
    setIsCreatingSkill(true);
    setSelectedSkillId(undefined);
    setSkillForm(emptySkillForm);
    setMessage('');
  }

  function updateSkillField(field: keyof typeof emptySkillForm, value: string) {
    if (selectedSkill && !selectedSkillId && !isCreatingSkill) {
      setSelectedSkillId(selectedSkill.id);
      setSkillForm({ ...skillToForm(selectedSkill), [field]: value });
      return;
    }
    setSkillForm(form => ({ ...form, [field]: value }));
  }

  async function saveExpert() {
    setMessage('');
    if (!expertDraft.key.trim() || !expertDraft.name.trim() || !expertDraft.systemPrompt.trim()) {
      setMessage('Expert key, name, and system prompt are required.');
      return;
    }
    const response = await upsertExpert.mutateAsync({
      key: expertDraft.key.trim(),
      name: expertDraft.name.trim(),
      role: expertDraft.role.trim() || 'product',
      description: expertDraft.description.trim(),
      system_prompt: expertDraft.systemPrompt.trim(),
      active: expertDraft.active,
    });
    setIsCreatingExpert(false);
    setSelectedExpertId(response.expert.id);
    setMessage('Expert saved.');
  }

  async function saveSkillVersion() {
    setMessage('');
    if (!selectedExpert?.id) {
      setMessage('Save or select an expert first.');
      return;
    }
    if (!skillDraft.name.trim() || !skillDraft.content.trim()) {
      setMessage('Skill name and content are required.');
      return;
    }
    const response = await upsertSkill.mutateAsync({
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim(),
      content: skillDraft.content.trim(),
      change_summary: selectedSkill ? 'Updated from expert editor.' : 'Created from expert editor.',
      target_agents: ['planning'],
      active: true,
    });
    setIsCreatingSkill(false);
    setSelectedSkillId(response.skill.id);
    setMessage('Skill version saved and promoted.');
  }

  async function proposeEvolution() {
    setMessage('');
    if (!effectiveSkillId) {
      setMessage('Select or save a skill before proposing evolution.');
      return;
    }
    if (!skillDraft.proposal.trim() || !skillDraft.rationale.trim()) {
      setMessage('Proposal content and rationale are required.');
      return;
    }
    await createProposal.mutateAsync({
      proposed_content: skillDraft.proposal.trim(),
      rationale: skillDraft.rationale.trim(),
    });
    setSkillForm(form => ({ ...form, proposal: '', rationale: '' }));
    setMessage('Evolution proposal created for review.');
  }

  return (
    <div className="flex h-full flex-col bg-bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Bot className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text-main">Expert editor</h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
              <span>{experts.length} experts</span>
              <span>·</span>
              <span>{activeExperts} active</span>
              {selectedExpert ? (
                <>
                  <span>·</span>
                  <span>{skills.length} skills</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {message ? (
            <span className="hidden max-w-sm truncate text-xs text-text-muted lg:inline">
              {message}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/console/experts">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(340px,420px)_minmax(320px,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-border-subtle bg-bg-surface lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 border-b border-border-subtle bg-bg-surface/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-text-main">Experts</h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  {expertsQuery.isLoading ? 'Loading' : `${experts.length} total`}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={startNewExpert}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          </div>

          <div className="grid gap-1 p-2">
            {experts.map(expert => (
              <button
                key={expert.id}
                type="button"
                onClick={() => editExpert(expert)}
                className={cn(
                  'rounded-md px-3 py-2 text-left transition-colors',
                  selectedExpert?.id === expert.id
                    ? 'bg-primary-subtle text-text-main ring-1 ring-primary/25'
                    : 'hover:bg-bg-subtle'
                )}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{expert.name}</span>
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      expert.active ? 'bg-success' : 'bg-text-muted'
                    )}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                  <span className="truncate">{expert.role || 'role'}</span>
                  <span>·</span>
                  <span className="truncate">{expert.key}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto border-b border-border-subtle bg-bg-surface lg:border-b-0 lg:border-r">
          <div className="border-b border-border-subtle px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-text-main">
                    {isCreatingExpert ? 'New expert' : selectedExpert?.name || 'Select expert'}
                  </h2>
                  {selectedExpert ? (
                    <Badge variant="outline" className="text-[10px]">
                      {selectedExpert.active ? 'active' : 'inactive'}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-text-muted">
                  {selectedExpert?.description || expertDraft.description || expertDraft.key}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={saveExpert}
                disabled={upsertExpert.isPending}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
            <div className="border-b border-border-subtle px-5 py-3">
              <TabsList className="h-8 rounded-md bg-bg-subtle p-1">
                <TabsTrigger value="profile" className="h-6 rounded px-3 text-xs">
                  Profile
                </TabsTrigger>
                <TabsTrigger value="skills" className="h-6 rounded px-3 text-xs">
                  Skills
                </TabsTrigger>
                <TabsTrigger value="activity" className="h-6 rounded px-3 text-xs">
                  Runs
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="profile" className="m-0 p-5">
              <div className="grid gap-4">
                <div className="grid gap-3">
                  <TextField
                    label="Key"
                    value={expertDraft.key}
                    onChange={value => updateExpertField('key', value)}
                    placeholder="architecture-impact"
                  />
                  <TextField
                    label="Role"
                    value={expertDraft.role}
                    onChange={value => updateExpertField('role', value)}
                    placeholder="architecture"
                  />
                  <TextField
                    label="Name"
                    value={expertDraft.name}
                    onChange={value => updateExpertField('name', value)}
                    placeholder="Architecture Impact Expert"
                  />
                </div>
                <TextField
                  label="Description"
                  value={expertDraft.description}
                  onChange={value => updateExpertField('description', value)}
                  placeholder="Constrains module boundaries and risks."
                />
                <label className="grid gap-1.5">
                  <Label htmlFor="expert-system-prompt">System prompt</Label>
                  <Textarea
                    id="expert-system-prompt"
                    className="min-h-44 resize-y font-mono text-xs leading-5"
                    value={expertDraft.systemPrompt}
                    onChange={event => updateExpertField('systemPrompt', event.target.value)}
                    placeholder="Review module boundaries, API contracts, risks, and migration constraints."
                  />
                </label>
                <div className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-text-main">Available for planning</div>
                    <div className="mt-0.5 text-xs text-text-muted">
                      {expertDraft.active ? 'Selected by default in planning.' : 'Hidden from active expert selection.'}
                    </div>
                  </div>
                  <Switch
                    checked={expertDraft.active}
                    onCheckedChange={checked => updateExpertField('active', checked)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="skills" className="m-0 p-0">
              <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-main">Skills</h3>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {selectedExpert ? `${skills.length} versions tracked` : 'No expert selected'}
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={startNewSkill}>
                  <Plus className="h-4 w-4" />
                  Skill
                </Button>
              </div>
              <div className="grid gap-1 p-2">
                {skills.map(skill => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => editSkill(skill)}
                    className={cn(
                      'rounded-md px-3 py-2 text-left',
                      selectedSkill?.id === skill.id && !isCreatingSkill
                        ? 'bg-primary-subtle ring-1 ring-primary/25'
                        : 'hover:bg-bg-subtle'
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-text-main">{skill.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        v{skill.current_version?.version ?? '-'}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                      {skill.description || 'No description'}
                    </p>
                  </button>
                ))}
                {selectedExpert && skills.length === 0 ? (
                  <div className="rounded-md px-3 py-8 text-center text-sm text-text-muted">
                    No skills yet.
                  </div>
                ) : null}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="m-0 p-0">
              <div className="grid gap-2 p-3">
                {runs.slice(0, 8).map(run => (
                  <div key={run.id} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-medium text-text-main">
                        <Clock3 className="h-3.5 w-3.5 text-text-muted" />
                        expert_run:{run.id}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(run.skill_version_refs ?? []).map(ref => (
                        <Badge key={ref} variant="outline" className="text-[10px] text-text-muted">
                          {ref}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {runs.length === 0 ? (
                  <div className="rounded-md px-3 py-8 text-center text-sm text-text-muted">
                    No runs recorded.
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </section>

        <section className="min-h-0 overflow-y-auto bg-bg-canvas">
          <div className="sticky top-0 z-10 border-b border-border-subtle bg-bg-canvas/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-text-main">
                  {selectedSkill ? selectedSkill.name : 'Skill version'}
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  {latestVersion ? `Current v${latestVersion.version}` : 'No current version'}
                  {pendingProposalCount > 0 ? ` · ${pendingProposalCount} pending proposal` : ''}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={saveSkillVersion}
                disabled={upsertSkill.isPending || !selectedExpert}
              >
                <History className="h-4 w-4" />
                Save version
              </Button>
            </div>
          </div>

          <div className="grid gap-4 p-5">
            <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
              <div className="grid gap-3">
                <TextField
                  label="Skill name"
                  value={skillDraft.name}
                  onChange={value => updateSkillField('name', value)}
                  placeholder="Planning constraints"
                />
                <TextField
                  label="Skill description"
                  value={skillDraft.description}
                  onChange={value => updateSkillField('description', value)}
                  placeholder="What this skill adds to plan generation."
                />
                <label className="grid gap-1.5">
                  <Label htmlFor="skill-content">Skill content</Label>
                  <Textarea
                    id="skill-content"
                    className="min-h-56 resize-y font-mono text-xs leading-5"
                    value={skillDraft.content}
                    onChange={event => updateSkillField('content', event.target.value)}
                    placeholder="Skill content"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-md border border-border-subtle bg-bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-text-muted" />
                  <h3 className="text-sm font-semibold text-text-main">Evolution proposal</h3>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  proposal only
                </Badge>
              </div>
              <div className="grid gap-3 p-4">
                <Textarea
                  className="min-h-28 resize-y font-mono text-xs leading-5"
                  value={skillDraft.proposal}
                  onChange={event => updateSkillField('proposal', event.target.value)}
                  placeholder="Proposed evolved skill content"
                />
                <Input
                  value={skillDraft.rationale}
                  onChange={event => updateSkillField('rationale', event.target.value)}
                  placeholder="Evolution rationale"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={proposeEvolution}
                  disabled={!effectiveSkillId || createProposal.isPending}
                >
                  Propose evolution
                </Button>
              </div>
              <Separator />
              <div className="grid gap-2 p-3">
                {proposals.slice(0, 5).map(proposal => (
                  <div key={proposal.id} className="rounded-md bg-bg-subtle p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-text-main">Proposal #{proposal.id}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {proposal.status}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                      {proposal.rationale}
                    </p>
                  </div>
                ))}
                {proposals.length === 0 ? (
                  <div className="rounded-md px-3 py-6 text-center text-sm text-text-muted">
                    No proposals.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-md border border-border-subtle bg-bg-surface">
              <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
                <FileClock className="h-4 w-4 text-text-muted" />
                <h3 className="text-sm font-semibold text-text-main">Version history</h3>
              </div>
              <div className="grid gap-1 p-3">
                {versions.slice(0, 6).map(version => (
                  <div key={version.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-text-main">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        v{version.version}
                      </div>
                      <p className="mt-1 truncate text-xs text-text-muted">
                        {version.change_summary || version.source}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {version.source}
                    </Badge>
                  </div>
                ))}
                {versions.length === 0 ? (
                  <div className="rounded-md px-3 py-6 text-center text-sm text-text-muted">
                    No versions.
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <label className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
