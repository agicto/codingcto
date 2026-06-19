'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import {
  Building2,
  LucideIcon,
  Settings,
  Bell,
  LogOut,
  Boxes,
  SquarePen,
  Inbox,
  ListChecks,
  ChevronDown,
  Plus,
  Github,
  GitBranch,
  BookOpen,
  Bot,
} from 'lucide-react';

import { cn } from '@/utils';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitcher } from '@/components/common';
import { useT } from '@/i18n';
import { useLogout } from '@/features/auth/hooks/use-auth';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useCreateWorkspace } from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  projectDeliveryIntakeHref,
  projectIdFromConsolePathname,
  projectSpecForgeHref,
  slugFromProjectName,
} from '@/features/project/project-utils';
import { useSpecForgeRuntimes } from '@/features/specforge/hooks/use-specforge';

interface WorkspaceNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  badge?: string;
  disabled?: boolean;
  activeOn?:
    | 'home'
    | 'projects'
    | 'codingcto'
    | 'agents'
    | 'skills'
    | 'github-settings'
    | 'repository-settings'
    | 'settings'
    | 'none';
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const settingsTab = searchParams.get('tab') ?? 'profile';
  const t = useT();
  const sidebarT = useT('dashboard.sidebar');
  const user = useAuthStore.use.user();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();
  const runtimesQuery = useSpecForgeRuntimes({ status: 'online', limit: 20 });
  const codexDispatchReady = useMemo(
    () =>
      (runtimesQuery.data?.runtimes ?? []).some(runtime => {
        if (runtime.status !== 'online' || runtime.executor !== 'codex_cli') {
          return false;
        }
        return (runtime.available_clis ?? []).some(
          cli => cli.available && cli.command === 'codex'
        );
      }),
    [runtimesQuery.data?.runtimes]
  );
  const currentProjectId = projectIdFromConsolePathname(pathname);
  const boardHref = currentProjectId
    ? projectSpecForgeHref(currentProjectId)
    : ROUTES.CONSOLE.PROJECTS;
  const agentsHref = `${ROUTES.CONSOLE.AGENTS}?return_to=${encodeURIComponent(boardHref)}`;
  const newRequirementHref = currentProjectId
    ? projectDeliveryIntakeHref(currentProjectId)
    : ROUTES.CONSOLE.PROJECTS;

  const deliveryNavItems: WorkspaceNavItem[] = [
    {
      title: sidebarT('items.delivery.title'),
      href: boardHref,
      icon: ListChecks,
      description: sidebarT('items.delivery.description'),
      badge: sidebarT('badges.live'),
      activeOn: 'codingcto',
    },
    {
      title: sidebarT('items.projects.title'),
      href: ROUTES.CONSOLE.PROJECTS,
      icon: Boxes,
      description: sidebarT('items.projects.description'),
      activeOn: 'projects',
    },
    {
      title: sidebarT('items.agents.title'),
      href: agentsHref,
      icon: Bot,
      description: sidebarT('items.agents.description'),
      badge: codexDispatchReady ? sidebarT('badges.codexReady') : undefined,
      activeOn: 'agents',
    },
  ];

  const reviewNavItems: WorkspaceNavItem[] = [
    {
      title: sidebarT('items.review.title'),
      href: ROUTES.CONSOLE.SPECFORGE,
      icon: Inbox,
      description: sidebarT('items.review.description'),
      badge: sidebarT('badges.soon'),
      disabled: true,
    },
  ];

  const platformNavItems: WorkspaceNavItem[] = [
    {
      title: sidebarT('items.skills.title'),
      href: ROUTES.CONSOLE.SKILLS,
      icon: BookOpen,
      description: sidebarT('items.skills.description'),
      activeOn: 'skills',
    },
    {
      title: sidebarT('items.settings.title'),
      href: ROUTES.CONSOLE.SETTINGS,
      icon: Settings,
      description: sidebarT('items.settings.description'),
      activeOn: 'settings',
    },
    {
      title: sidebarT('items.github.title'),
      href: `${ROUTES.CONSOLE.SETTINGS}?tab=github`,
      icon: Github,
      description: sidebarT('items.github.description'),
      activeOn: 'github-settings',
    },
    {
      title: sidebarT('items.repositories.title'),
      href: `${ROUTES.CONSOLE.SETTINGS}?tab=repositories`,
      icon: GitBranch,
      description: sidebarT('items.repositories.description'),
      activeOn: 'repository-settings',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-bg-canvas text-text-main">
      <aside className="hidden w-[256px] shrink-0 flex-col border-r border-border-subtle bg-bg-surface/90 px-3 py-3 md:flex">
        <WorkspaceSwitcher />

        <div className="mt-4 space-y-1">
          <Link
            href={newRequirementHref}
            className="flex h-10 items-center justify-between rounded-full px-3 text-sm font-medium text-text-main transition-colors hover:bg-bg-subtle"
          >
            <span className="flex items-center gap-2">
              <SquarePen className="h-4 w-4" />
              {sidebarT('quick.newRequirement')}
            </span>
            <kbd className="rounded-full bg-bg-subtle px-2 py-0.5 text-[11px] font-medium text-text-subtle">
              C
            </kbd>
          </Link>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
          <SidebarSection
            title={sidebarT('groups.deliver')}
            items={deliveryNavItems}
            pathname={pathname}
            settingsTab={settingsTab}
          />
          <SidebarSection
            title={sidebarT('groups.review')}
            items={reviewNavItems}
            pathname={pathname}
            settingsTab={settingsTab}
          />
          <SidebarSection
            title={sidebarT('groups.platform')}
            items={platformNavItems}
            pathname={pathname}
            settingsTab={settingsTab}
          />
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-border-subtle px-3 pt-3 text-xs text-text-muted">
          <Settings className="h-3.5 w-3.5" />
          <Link
            href={ROUTES.CONSOLE.SETTINGS}
            className="truncate hover:text-text-main"
          >
            {sidebarT('footer')}
          </Link>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface/85 px-4 backdrop-blur-xl">
          <Link href={ROUTES.CONSOLE.HOME} className="flex items-center">
            <Logo className="h-5 w-auto" />
          </Link>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="ghost" isIcon className="h-8 w-8 rounded-md">
              <Bell className="h-4 w-4 text-text-subtle" />
              <span className="sr-only">{t('nav.notifications')}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  isIcon
                  noScale
                  className="h-8 w-8 overflow-hidden rounded-full"
                >
                  <Avatar className="h-full w-full">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback className="bg-muted text-xs text-text-main">
                      {user?.name
                        ?.split(' ')
                        .map(part => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'CT'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="sr-only">{t('nav.profile')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-lg p-1">
                <div className="px-2 py-1.5 text-xs font-medium text-text-muted">
                  {user?.name || t('nav.profile')}
                </div>
                <DropdownMenuItem asChild>
                  <Link href={ROUTES.CONSOLE.SETTINGS}>{t('nav.profile')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={ROUTES.CONSOLE.SETTINGS}>{t('nav.settings')}</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={event => {
                    event.preventDefault();
                    logout();
                  }}
                  disabled={isLoggingOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('auth.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          {children}
        </main>
      </section>
    </div>
  );
}

function WorkspaceSwitcher() {
  const t = useT('dashboard.sidebar.workspace');
  const {
    workspaces,
    workspacesQuery,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
  } = useSelectedWorkspace();
  const createWorkspace = useCreateWorkspace();
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [message, setMessage] = useState('');

  function handleWorkspaceName(value: string) {
    setWorkspaceName(value);
    setWorkspaceSlug(current => current || slugFromProjectName(value));
  }

  async function createWorkspaceFromSwitcher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    const slug = slugFromProjectName(workspaceSlug || workspaceName);
    if (name.length < 2) {
      setMessage(t('nameInvalid'));
      return;
    }
    if (!slug) {
      setMessage(t('required'));
      return;
    }
    if (slug.length < 2) {
      setMessage(t('slugInvalid'));
      return;
    }
    setMessage('');
    try {
      const response = await createWorkspace.mutateAsync({
        name,
        slug,
        description: workspaceDescription.trim(),
      });
      setSelectedWorkspaceId(response.workspace.workspace_id);
      setWorkspaceName('');
      setWorkspaceSlug('');
      setWorkspaceDescription('');
      setMessage(t('created', { name: response.workspace.name }));
    } catch {
      setMessage(t('createFailed'));
    }
  }

  const fallbackName = workspacesQuery.isLoading ? t('loading') : 'CodingCTO';
  const workspaceNameLabel = selectedWorkspace?.name || fallbackName;
  const workspaceInitial = (selectedWorkspace?.name || 'C').trim().slice(0, 1).toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-10 w-full items-center justify-between rounded-full px-3 text-left text-sm font-medium transition-colors hover:bg-bg-subtle">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-subtle text-xs font-semibold text-text-main">
              {workspaceInitial}
            </span>
            <span className="truncate">{workspaceNameLabel}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-3">
        <div className="flex items-start gap-3 rounded-lg border border-border-subtle bg-bg-subtle p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{t('title')}</div>
            <p className="mt-1 text-xs leading-5 text-text-muted">{t('description')}</p>
          </div>
        </div>

        <div className="mt-3 max-h-44 space-y-1 overflow-auto">
          {workspaces.map(workspace => (
            <button
              key={workspace.workspace_id}
              type="button"
              onClick={() => setSelectedWorkspaceId(workspace.workspace_id)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted',
                selectedWorkspaceId === workspace.workspace_id && 'bg-primary-subtle text-primary'
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{workspace.name}</span>
                <span className="block truncate text-xs text-text-muted">{workspace.slug}</span>
              </span>
              {selectedWorkspaceId === workspace.workspace_id ? (
                <span className="text-xs">{t('current')}</span>
              ) : null}
            </button>
          ))}
          {!workspacesQuery.isLoading && workspaces.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-bg-surface p-3 text-sm text-text-muted">
              {t('empty')}
            </div>
          ) : null}
        </div>

        <form
          className="mt-3 space-y-2 border-t border-border-subtle pt-3"
          onSubmit={createWorkspaceFromSwitcher}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4 text-primary" />
            {t('newWorkspace')}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="global-workspace-name">{t('name')}</Label>
            <Input
              id="global-workspace-name"
              value={workspaceName}
              onChange={event => handleWorkspaceName(event.target.value)}
              placeholder="Acme Platform"
              minLength={2}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="global-workspace-slug">{t('slug')}</Label>
            <Input
              id="global-workspace-slug"
              value={workspaceSlug}
              onChange={event => setWorkspaceSlug(slugFromProjectName(event.target.value))}
              placeholder="acme-platform"
              minLength={2}
              maxLength={100}
            />
          </div>
          <Textarea
            value={workspaceDescription}
            onChange={event => setWorkspaceDescription(event.target.value)}
            placeholder={t('descriptionPlaceholder')}
            rows={2}
          />
          {message ? (
            <div className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1.5 text-xs leading-5 text-text-muted">
              {message}
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={createWorkspace.isPending}>
            {createWorkspace.isPending ? t('creating') : t('createAndSwitch')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SidebarSection({
  title,
  items,
  pathname,
  settingsTab,
}: {
  title: string;
  items: WorkspaceNavItem[];
  pathname: string;
  settingsTab: string;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="px-3 pb-1.5 text-[11px] font-medium text-text-muted">{title}</div>
      <nav className="space-y-1 text-sm">
        {items.map(item => (
          <SidebarLink
            key={`${title}-${item.title}`}
            {...item}
            pathname={pathname}
            settingsTab={settingsTab}
          />
        ))}
      </nav>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  title,
  description,
  badge,
  disabled,
  activeOn,
  pathname,
  settingsTab,
}: {
  href: string;
  icon: LucideIcon;
  label?: string;
  title?: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
  activeOn?: WorkspaceNavItem['activeOn'];
  pathname: string;
  settingsTab: string;
}) {
  const text = label ?? title ?? '';
  const active = !disabled && isSidebarItemActive({ href, activeOn }, pathname, settingsTab);
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="block min-w-0 truncate">{text}</span>
      </span>
      {badge ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            disabled
              ? 'bg-bg-subtle text-text-muted'
              : active
                ? 'bg-bg-surface text-text-subtle'
                : 'bg-bg-subtle text-text-muted'
          )}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  const className = cn(
    'relative flex h-10 items-center justify-between gap-2 rounded-full px-3 text-text-subtle transition-colors hover:bg-bg-subtle hover:text-text-main',
    active && 'bg-bg-subtle pl-4 font-medium text-text-main hover:bg-bg-subtle hover:text-text-main before:absolute before:left-2 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-primary',
    disabled && 'cursor-not-allowed opacity-55 hover:bg-transparent hover:text-text-subtle'
  );

  if (disabled) {
    return (
      <div aria-disabled="true" title={description} className={className}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      title={description}
      className={className}
    >
      {content}
    </Link>
  );
}

function isSidebarItemActive(
  item: Pick<WorkspaceNavItem, 'href' | 'activeOn'>,
  pathname: string,
  settingsTab: string
) {
  if (item.activeOn === 'home') {
    return pathname === ROUTES.CONSOLE.HOME;
  }
  if (item.activeOn === 'projects') {
    const isProjectScopedDelivery =
      pathname.includes('/codingcto') || pathname.includes('/specforge');
    return (
      !isProjectScopedDelivery &&
      (pathname === ROUTES.CONSOLE.PROJECTS || pathname.startsWith('/console/projects/'))
    );
  }
  if (item.activeOn === 'codingcto') {
    return pathname.includes('/codingcto') || pathname.includes('/specforge');
  }
  if (item.activeOn === 'agents') {
    return pathname === ROUTES.CONSOLE.AGENTS || pathname.startsWith(`${ROUTES.CONSOLE.AGENTS}/`);
  }
  if (item.activeOn === 'skills') {
    return pathname === ROUTES.CONSOLE.SKILLS || pathname.startsWith(`${ROUTES.CONSOLE.SKILLS}/`);
  }
  if (item.activeOn === 'settings') {
    return (
      (pathname === ROUTES.CONSOLE.SETTINGS ||
        pathname.startsWith(`${ROUTES.CONSOLE.SETTINGS}/`)) &&
      settingsTab !== 'github' &&
      settingsTab !== 'repositories'
    );
  }
  if (item.activeOn === 'github-settings') {
    return pathname === ROUTES.CONSOLE.SETTINGS && settingsTab === 'github';
  }
  if (item.activeOn === 'repository-settings') {
    return pathname === ROUTES.CONSOLE.SETTINGS && settingsTab === 'repositories';
  }
  if (item.activeOn === 'none') {
    return false;
  }
  return pathname === item.href || (item.href !== ROUTES.CONSOLE.HOME && pathname.startsWith(`${item.href}/`));
}
