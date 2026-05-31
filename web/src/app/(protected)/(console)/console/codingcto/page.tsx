import Link from 'next/link';
import { ArrowRight, GitBranch, GitPullRequest, Inbox } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ROUTES } from '@/constants/routes';

export default async function CodingCTOPage() {
  const t = await getTranslations('dashboard.deliveryEntry');

  const cards = [
    {
      title: t('cards.project.title'),
      description: t('cards.project.description'),
      icon: GitPullRequest,
    },
    {
      title: t('cards.github.title'),
      description: t('cards.github.description'),
      icon: GitBranch,
    },
    {
      title: t('cards.review.title'),
      description: t('cards.review.description'),
      icon: Inbox,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <section className="rounded-2xl border border-border-subtle bg-bg-surface p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-primary">
          {t('eyebrow')}
        </div>
        <h1 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-text-main md:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-muted">{t('description')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={ROUTES.CONSOLE.PROJECTS}>
              {t('primaryAction')}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`${ROUTES.CONSOLE.SETTINGS}?tab=github`}>{t('githubAction')}</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ title, description, icon: Icon }) => (
          <Card key={title}>
            <CardHeader>
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="leading-6">{description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>
    </div>
  );
}
