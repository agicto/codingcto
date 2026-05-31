import Link from "next/link";
import { ArrowUpRight, CheckCircle2, GitPullRequest, Github, Inbox, PanelsTopLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/constants/routes";
import { getSessionUser } from "@/features/auth/server/session";

import { GreetingClock } from "./_components/greeting-clock";

/**
 * Console dashboard (RSC). Keeps the landing page focused on real delivery flows.
 */
export default async function ConsoleHomePage() {
  const user = await getSessionUser();
  const t = await getTranslations("dashboard.console");

  const quickLinks = [
    {
      title: t("cards.projects.title"),
      description: t("cards.projects.description"),
      href: ROUTES.CONSOLE.PROJECTS,
      icon: PanelsTopLeft,
      action: t("cards.projects.action"),
      disabled: false,
    },
    {
      title: t("cards.delivery.title"),
      description: t("cards.delivery.description"),
      href: ROUTES.CONSOLE.SPECFORGE,
      icon: GitPullRequest,
      action: t("cards.delivery.action"),
      disabled: false,
    },
    {
      title: t("cards.github.title"),
      description: t("cards.github.description"),
      href: `${ROUTES.CONSOLE.SETTINGS}?tab=github`,
      icon: Github,
      action: t("cards.github.action"),
      disabled: false,
    },
    {
      title: t("cards.review.title"),
      description: t("cards.review.description"),
      href: ROUTES.CONSOLE.SPECFORGE,
      icon: Inbox,
      action: t("cards.review.action"),
      disabled: true,
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-10">
      <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-border-subtle bg-bg-surface p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">
            {t("eyebrow")}
          </div>
          <GreetingClock name={user?.name ?? user?.email ?? "there"} />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{t("description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={ROUTES.CONSOLE.SPECFORGE}>
              {t("openDelivery")}
              <ArrowUpRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={ROUTES.CONSOLE.PROJECTS}>{t("openProjects")}</Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {quickLinks.map(({ title, description, href, icon: Icon, action, disabled }) => (
          <Card
            key={title}
            className={disabled ? "opacity-75" : "transition-colors hover:border-primary/40"}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="mt-1">{description}</CardDescription>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </div>
            </CardHeader>
            <CardContent>
              {disabled ? (
                <Button variant="ghost" size="sm" className="-ml-2" disabled>
                  {action}
                </Button>
              ) : (
                <Button asChild variant="ghost" size="sm" className="-ml-2">
                  <Link href={href}>
                    {action}
                    <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-border-subtle bg-bg-surface p-5">
        <h2 className="text-base font-semibold">{t("focusTitle")}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            t("focusSteps.workspace"),
            t("focusSteps.project"),
            t("focusSteps.context"),
            t("focusSteps.delivery"),
          ].map(step => (
            <div key={step} className="flex gap-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{step}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
