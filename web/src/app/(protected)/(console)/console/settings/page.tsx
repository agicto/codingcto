import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';

import { GitHubConnectionPanel } from './_components/github-connection-panel';

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

/**
 * Settings only exposes backend-backed integration controls.
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  await searchParams;
  const t = await getTranslations('settings.github');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="rounded-2xl border border-border-subtle bg-bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-primary/30 text-primary">
            {t('eyebrow')}
          </Badge>
          <Badge variant="outline" className="text-success">
            {t('liveOnly')}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
          {t('heading')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{t('description')}</p>
      </header>

      <GitHubConnectionPanel />
    </div>
  );
}
