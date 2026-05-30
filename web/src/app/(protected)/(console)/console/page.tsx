import Link from "next/link";
import { Activity, ArrowUpRight, BookOpen, Code2, Rocket } from "lucide-react";

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
 * Console dashboard (RSC).
 *
 * Default landing for authenticated users. Kept deliberately minimal —
 * this is a scaffold example, not a product. Replace with your real
 * domain UI.
 *
 * Pattern: page is a Server Component; the only client island is
 * `GreetingClock` which re-renders the wall-clock every minute.
 */
export default async function ConsoleHomePage() {
  const user = await getSessionUser();

  const quickLinks = [
    {
      title: "API 文档",
      description: "查看 CodingCTO Go 后端的 OpenAPI 规范。",
      href: ROUTES.CONSOLE.SETTINGS,
      icon: BookOpen,
    },
    {
      title: "设计规范",
      description: "浏览设计系统和组件展示。",
      href: ROUTES.DEVTOOLS.STYLEGUIDE,
      icon: Code2,
    },
    {
      title: "多语言测试",
      description: "检查 next-intl 翻译树。",
      href: ROUTES.DEVTOOLS.I18N_TEST,
      icon: Activity,
    },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <GreetingClock name={user?.name ?? user?.email ?? "用户"} />
          <p className="mt-1 text-sm text-text-muted">
            欢迎使用 CodingCTO 控制台。这是一个示例首页，可以替换成你的业务工作台。
          </p>
        </div>
        <Button asChild>
          <Link href={ROUTES.CONSOLE.SETTINGS}>
            打开设置
            <ArrowUpRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {quickLinks.map(({ title, description, href, icon: Icon }) => (
          <Card key={href} className="transition-colors hover:border-primary/40">
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
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href={href}>
                  打开
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-10 rounded-xl border bg-bg-surface p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Rocket className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">下一步</h2>
            <ul className="mt-2 space-y-1 text-sm text-text-muted">
              <li>
                将 <code className="font-mono text-xs">NEXT_PUBLIC_API_URL</code> 指向 CodingCTO
                Go 后端，或替换为你自己的 API。
              </li>
              <li>
                将这个页面（
                <code className="font-mono text-xs">
                  src/app/(protected)/(console)/console/page.tsx
                </code>
                ）替换为真实业务仪表盘。
              </li>
              <li>
                将新功能放入 <code className="font-mono text-xs">src/features/</code>
                {"，"}并通过控制台路由暴露出来。
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
