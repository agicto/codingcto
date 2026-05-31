'use client';

import Link from 'next/link';
import {
  Github,
  GitBranch,
  Save,
  User,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/features/auth/store/auth-store';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import { useT } from '@/i18n';
import { cn } from '@/utils';

import { GitHubConnectionPanel } from './github-connection-panel';

type SettingsMode = 'profile' | 'repositories' | 'github';

type SettingsShellProps = {
  mode: SettingsMode;
};

const settingsNav = [
  {
    group: 'account',
    items: [
      { tab: 'profile', label: 'profile', icon: User },
    ],
  },
  {
    group: 'workspace',
    items: [
      { tab: 'repositories', label: 'repositories', icon: GitBranch },
      { tab: 'github', label: 'github', icon: Github },
    ],
  },
] as const;

export function SettingsShell({ mode }: SettingsShellProps) {
  const t = useT('settings');
  const { selectedWorkspace } = useSelectedWorkspace();
  const workspaceCaption = selectedWorkspace?.name || t('settingsConsole.groups.workspace');

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-bg-canvas">
      <aside className="hidden w-[240px] shrink-0 border-r border-border-subtle bg-bg-surface px-6 py-7 lg:block">
        <h1 className="text-base font-semibold text-text-main">{t('settingsConsole.title')}</h1>
        <nav className="mt-8 space-y-7">
          {settingsNav.map(group => (
            <div key={group.group}>
              <div className="mb-2 text-xs font-medium text-text-muted">
                {group.group === 'workspace'
                  ? workspaceCaption
                  : t('settingsConsole.groups.account')}
              </div>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  const active = mode === item.tab;
                  return (
                    <Link
                      key={item.tab}
                      href={`${ROUTES.CONSOLE.SETTINGS}?tab=${item.tab}`}
                      className={cn(
                        'flex h-9 items-center gap-2 rounded-md px-2 text-sm text-text-subtle hover:bg-muted hover:text-text-main',
                        active && 'bg-bg-subtle font-medium text-text-main'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{t(`settingsConsole.items.${item.label}`)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 py-7 md:px-8">
          {mode === 'profile' ? <ProfileSettingsPanel /> : null}
          {mode === 'repositories' ? <RepositorySettingsPanel /> : null}
          {mode === 'github' ? <GitHubSettingsPanel /> : null}
        </div>
      </main>
    </div>
  );
}

function ProfileSettingsPanel() {
  const t = useT('settings.settingsConsole.profile');
  const user = useAuthStore.use.user();
  const name = user?.name || 'wang Jaxson';
  const initials = name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <section>
      <h2 className="text-xl font-semibold text-text-main">{t('title')}</h2>
      <Card className="mt-5 max-w-3xl">
        <CardContent className="space-y-5 p-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              className="text-sm text-text-muted hover:text-text-main"
            >
              {t('uploadAvatar')}
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-name" className="text-sm font-medium text-text-subtle">
              {t('name')}
            </label>
            <Input id="profile-name" defaultValue={name} />
          </div>

          <div className="space-y-2">
            <label htmlFor="profile-about" className="text-sm font-medium text-text-subtle">
              {t('about')}
            </label>
            <Textarea
              id="profile-about"
              rows={4}
              maxLength={2000}
              placeholder={t('aboutPlaceholder')}
            />
            <div className="flex items-start justify-between gap-3 text-xs leading-5 text-text-muted">
              <span>{t('aboutHelp')}</span>
              <span>0/2000</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="default">
              <Save className="h-4 w-4" />
              {t('save')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function RepositorySettingsPanel() {
  const t = useT('settings.github.panel');

  return (
    <section>
      <h2 className="text-xl font-semibold text-text-main">{t('sections.repository')}</h2>
      <div className="mt-5">
        <GitHubConnectionPanel mode="repositories" />
      </div>
    </section>
  );
}

function GitHubSettingsPanel() {
  const t = useT('settings.github');

  return (
    <section>
      <h2 className="text-xl font-semibold text-text-main">{t('heading')}</h2>
      <div className="mt-5">
        <GitHubConnectionPanel mode="github" />
      </div>
    </section>
  );
}

export type { SettingsMode };
