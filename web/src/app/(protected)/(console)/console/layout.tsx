'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FormEvent, useState } from 'react';
import {
  Building2,
  LucideIcon,
  Settings,
  Bell,
  LogOut,
  GitPullRequest,
  Boxes,
  SquarePen,
  Inbox,
  ListChecks,
  ChevronDown,
  Plus,
  Github,
} from 'lucide-react';

import { cn } from '@/utils';
import { ROUTES } from '@/constants/routes';
import { Button } from '@/components/ui/button';
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
import { slugFromProjectName } from '@/features/project/project-utils';

interface WorkspaceNavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  badge?: string;
  disabled?: boolean;
  activeOn?: 'home' | 'projects' | 'codingcto' | 'settings' | 'none';
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const sidebarT = useT('dashboard.sidebar');
  const user = useAuthStore.use.user();
  const { mutate: logout, isPending: isLoggingOut } = useLogout();

  const deliveryNavItems: WorkspaceNavItem[] = [
    {
      title: sidebarT('items.delivery.title'),
      href: ROUTES.CONSOLE.SPECFORGE,
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
      title: sidebarT('items.github.title'),
      href: `${ROUTES.CONSOLE.SETTINGS}?tab=github`,
      icon: Github,
      description: sidebarT('items.github.description'),
      activeOn: 'settings',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-bg-canvas text-text-main">
      <aside className="hidden w-[256px] shrink-0 flex-col border-r border-border-subtle bg-bg-subtle px-3 py-3 md:flex">
        <WorkspaceSwitcher />

        <div className="mt-4 space-y-1">
          <Link
            href={ROUTES.CONSOLE.SPECFORGE}
            className="flex h-9 items-center justify-between rounded-lg px-2 text-sm text-text-subtle hover:bg-muted hover:text-text-main"
          >
            <span className="flex items-center gap-2">
              <SquarePen className="h-4 w-4" />
              {sidebarT('quick.newRequirement')}
            </span>
            <kbd className="rounded border border-border-main bg-bg-surface px-1.5 py-0.5 text-[11px] text-text-muted">
              C
            </kbd>
          </Link>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
          <SidebarSection
            title={sidebarT('groups.deliver')}
            items={deliveryNavItems}
            pathname={pathname}
          />
          <SidebarSection
            title={sidebarT('groups.review')}
            items={reviewNavItems}
            pathname={pathname}
          />
          <SidebarSection
            title={sidebarT('groups.platform')}
            items={platformNavItems}
            pathname={pathname}
          />
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-border-subtle px-2 pt-3 text-xs text-text-muted">
          <Settings className="h-3.5 w-3.5" />
          <Link
            href={`${ROUTES.CONSOLE.SETTINGS}?tab=github`}
            className="truncate hover:text-text-main"
          >
            {sidebarT('footer')}
          </Link>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-surface px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <GitPullRequest className="h-4 w-4 text-primary" />
            CodingCTO
          </div>
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <ThemeToggle />
            <Button variant="ghost" isIcon className="h-8 w-8 rounded-md">
              <Bell className="h-4 w-4 text-text-subtle" />
              <span className="sr-only">Notifications</span>
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
                  <span className="sr-only">Profile</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-lg p-1">
                <div className="px-2 py-1.5 text-xs font-medium text-text-muted">
                  {user?.name || t('nav.profile')}
                </div>
                <DropdownMenuItem>{t('nav.profile')}</DropdownMenuItem>
                <DropdownMenuItem>{t('nav.settings')}</DropdownMenuItem>
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

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
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
    if (!name || !slug) {
      setMessage(t('required'));
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

  const fallbackName = workspacesQuery.isLoading ? t('loading') : t('createWorkspace');
  const workspaceNameLabel = selectedWorkspace?.name || fallbackName;
  const workspaceInitial = (selectedWorkspace?.name || 'C').trim().slice(0, 1).toUpperCase();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-9 w-full items-center justify-between rounded-md px-2 text-left text-sm font-medium hover:bg-muted">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-border-main bg-bg-surface text-xs font-semibold text-text-subtle">
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
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="global-workspace-slug">{t('slug')}</Label>
            <Input
              id="global-workspace-slug"
              value={workspaceSlug}
              onChange={event => setWorkspaceSlug(slugFromProjectName(event.target.value))}
              placeholder="acme-platform"
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
}: {
  title: string;
  items: WorkspaceNavItem[];
  pathname: string;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="px-2 pb-1.5 text-xs font-medium text-text-muted">{title}</div>
      <nav className="space-y-1 text-sm">
        {items.map(item => (
          <SidebarLink key={`${title}-${item.title}`} {...item} pathname={pathname} />
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
}) {
  const text = label ?? title ?? '';
  const active = !disabled && isSidebarItemActive({ href, activeOn }, pathname);
  const showDescription = Boolean(active && description);
  const content = (
    <>
      <span className="flex min-w-0 items-start gap-2">
        <Icon className={cn('h-4 w-4 shrink-0', showDescription ? 'mt-0.5' : 'mt-0')} />
        <span className="min-w-0">
          <span className="block truncate">{text}</span>
          {showDescription ? (
            <span className="mt-0.5 block truncate text-[11px] leading-4 text-text-muted">
              {description}
            </span>
          ) : null}
        </span>
      </span>
      {badge ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
            disabled ? 'bg-muted text-text-muted' : 'bg-bg-surface text-text-muted'
          )}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  const className = cn(
    'flex min-h-9 items-start justify-between gap-2 rounded-lg px-2 py-2 text-text-subtle hover:bg-muted hover:text-text-main',
    active && 'bg-primary-subtle text-primary',
    disabled && 'cursor-not-allowed opacity-70 hover:bg-transparent hover:text-text-subtle'
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
  pathname: string
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
  if (item.activeOn === 'settings') {
    return pathname === ROUTES.CONSOLE.SETTINGS || pathname.startsWith(`${ROUTES.CONSOLE.SETTINGS}/`);
  }
  if (item.activeOn === 'none') {
    return false;
  }
  return pathname === item.href || (item.href !== ROUTES.CONSOLE.HOME && pathname.startsWith(`${item.href}/`));
}
