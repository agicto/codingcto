import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowRight, 
  Shield, 
  Globe, 
  Terminal, 
  Sparkles, 
  Palette,
  Atom,
  Database,
  ShieldCheck
} from 'lucide-react';

/**
 * CodingCTO homepage
 * Unified design language with Auth and Console sections
 */
export default async function HomePage() {
  const t = await getTranslations('site');
  const features = featuresData(t);

  return (
    <div className="min-h-screen bg-white text-[#07143d] dark:bg-bg-canvas dark:text-text-main">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(17,99,255,0.16),transparent_30%),radial-gradient(circle_at_85%_8%,rgba(99,102,241,0.12),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f7fbff_62%,#ffffff_100%)] dark:bg-[radial-gradient(circle_at_15%_0%,rgba(110,160,255,0.18),transparent_30%),radial-gradient(circle_at_85%_8%,rgba(99,102,241,0.16),transparent_28%),linear-gradient(180deg,#050916_0%,#07101f_62%,#050916_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-300 to-transparent" />

        <div className="container relative py-20 md:py-28 lg:py-36">
          <div className="mx-auto max-w-4xl text-center">
            {/* Badge */}
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {t('hero.eyebrow')}
            </Badge>

            {/* Title */}
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
              {t('hero.titlePrefix')}{' '}
              <span className="bg-linear-to-r from-primary to-primary-deeper bg-clip-text text-transparent">
                {t('hero.titleHighlight')}
              </span>
            </h1>

            {/* Description */}
            <p className="mt-6 text-lg text-text-muted md:text-xl max-w-2xl mx-auto">
              {t('hero.description')}
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link href="/register">
                <Button size="lg" className="h-12 px-8 gap-2 shadow-button-primary">
                  {t('hero.getStarted')}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/console">
                <Button variant="outline" size="lg" className="h-12 px-8">
                  {t('hero.viewDemo')}
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-blue-100/80 bg-white/72 p-3 shadow-[0_30px_90px_rgba(17,99,255,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
              <WorkflowDiagram />
            </div>
          </div>

      {/* Features Section */}
      <section className="py-20 md:py-28 bg-bg-subtle/30">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('features.title')}
            </h2>
            <p className="mt-4 text-text-muted max-w-2xl mx-auto">
              {t('features.description')}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="group bg-bg-surface border-border/50 hover:shadow-premium hover:-translate-y-1 transition-all duration-300"
              >
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-text-muted leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Stack Section */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t('stack.title')}
            </h2>
            <p className="mt-4 text-text-muted">
              {t('stack.description')}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {techStackData.map((tech, index) => (
              <div 
                key={index}
                className="flex items-center gap-3 px-5 py-3 rounded-xl bg-bg-surface border border-border/50 hover:border-primary/30 hover:shadow-md transition-all duration-300"
              >
                {tech.icon}
                <span className="font-medium">{tech.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Using primary gradient like Auth */}
      <section className="relative overflow-hidden bg-linear-to-br from-primary via-primary/95 to-primary-deeper py-20 md:py-28">
        {/* Background decorations */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-[-20%] left-[-10%] w-[30%] h-[30%] rounded-full bg-primary-deeper/30 blur-2xl" />
        </div>

        <div className="container relative text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            {t('cta.title')}
          </h2>
          <p className="mt-4 text-white/80 max-w-xl mx-auto md:text-lg">
            {t('cta.description')}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" variant="secondary" className="h-12 px-8 gap-2">
                {t('cta.getStarted')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a 
              href="https://github.com/agicto/codingcto"
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Button 
                size="lg" 
                variant="outline" 
                className="h-12 px-8 bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white"
              >
                {t('cta.viewGitHub')}
              </Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

// Features data
type SiteTranslator = Awaited<ReturnType<typeof getTranslations>>;

const featuresData = (t: SiteTranslator) => [
  {
    title: t('features.items.auth.title'),
    description: t('features.items.auth.description'),
    icon: Shield,
  },
  {
    title: t('features.items.console.title'),
    description: t('features.items.console.description'),
    icon: Terminal,
  },
  {
    title: t('features.items.context.title'),
    description: t('features.items.context.description'),
    icon: Globe,
  },
  {
    title: t('features.items.review.title'),
    description: t('features.items.review.description'),
    icon: Palette,
  },
];

function InputStage() {
  return (
    <ProcessCard className="border-blue-200 dark:border-blue-400/40">
      <div className="flex flex-col items-center text-center">
        <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-full bg-[#2f6cff] text-white shadow-[0_18px_35px_rgba(47,108,255,0.35)]">
          <MessageSquareText className="h-9 w-9" />
        </div>
        <h2 className="text-xl font-black">需求输入</h2>
        <p className="mt-4 text-sm leading-7 text-[#425072] dark:text-text-subtle">
          功能需求、问题修复
          <br />
          或产品想法
        </p>
      </div>
    </ProcessCard>
  );
}

function TeamStage() {
  return (
    <ProcessCard className="relative border-[#6d4cff] shadow-[0_18px_40px_rgba(109,76,255,0.12)] dark:border-[#8d7aff]">
      <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl bg-[#6d4cff] px-8 py-2 text-sm font-bold text-white">
        CodingCTO
      </div>
      <div className="pt-7">
        <div className="mb-4 flex items-center justify-center gap-2 text-xl font-black">
          <UsersRound className="h-5 w-5 text-[#6d4cff]" />
          数字研发团队
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {teamRoles.map((role, index) => (
            <div key={role.name} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ebe7ff] text-2xl shadow-inner dark:bg-white/10">
                {['👩', '👨‍💻', '👩‍🎨', '👨‍🔬'][index]}
              </div>
              <div className="mt-2 text-sm font-bold">{role.name}</div>
              <div className="mt-1 text-xs leading-5 text-[#596681] dark:text-text-muted">
                {role.detail}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {knowledgeItems.map((item, index) => (
            <div
              key={item}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#f0edff] px-2 py-2 text-xs font-semibold text-[#3724b8] dark:bg-white/10 dark:text-[#cfc7ff]"
            >
              {index === 0 ? <Sparkles className="h-3.5 w-3.5" /> : null}
              {index === 1 ? <Target className="h-3.5 w-3.5" /> : null}
              {index === 2 ? <FileCode2 className="h-3.5 w-3.5" /> : null}
              {index === 3 ? <ClipboardCheck className="h-3.5 w-3.5" /> : null}
              {item}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-sm font-bold text-[#4f35ff] dark:text-[#a99bff]">
          多专家协同分析，输出可执行方案
        </p>
      </div>
    </ProcessCard>
  );
}

function AgentStage() {
  return (
    <ProcessCard className="border-[#1163ff] dark:border-[#6ea0ff]">
      <h2 className="mb-4 text-center text-lg font-black text-[#1163ff] dark:text-[#6ea0ff]">
        AI 编码代理
      </h2>
      <div className="space-y-2">
        {agents.map((agent, index) => (
          <div
            key={agent}
            className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 text-sm font-bold shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10"
          >
            <AgentIcon index={index} />
            {agent}
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-sm font-bold text-[#1163ff] dark:text-[#6ea0ff]">
        调度最佳 Agent 执行开发任务
      </p>
    </ProcessCard>
  );
}

function QualityStage() {
  return (
    <ProcessCard className="border-[#20a35a] dark:border-[#49d987]">
      <h2 className="mb-4 text-center text-lg font-black text-[#159448] dark:text-[#6ee7a1]">
        自动化质量保障
      </h2>
      <div className="space-y-2">
        {qualityItems.map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#31b966] text-white">
              {index < 2 ? <TestTube2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </span>
            {item}
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-sm font-bold text-[#159448] dark:text-[#6ee7a1]">
        自动测试、审查与修复
        <br />
        确保高质量交付
      </p>
    </ProcessCard>
  );
}

function DeliveryStage() {
  return (
    <ProcessCard className="border-[#ff7a22] dark:border-[#ff9a55]">
      <h2 className="mb-5 text-center text-lg font-black text-[#f26316] dark:text-[#ffad77]">
        生产级 PR 交付
      </h2>
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#ff7a22] text-white shadow-[0_0_0_12px_rgba(255,122,34,0.13)]">
        <GitBranchIcon />
      </div>
      <div className="space-y-2">
        {deliveryItems.map(item => (
          <div key={item} className="flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-[#ff7a22]" />
            {item}
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-[#fff0e8] px-3 py-2 text-sm font-bold text-[#f26316] dark:bg-[#ff7a22]/15 dark:text-[#ffad77]">
        <Rocket className="h-4 w-4" />
        Ready to Merge
      </div>
    </ProcessCard>
  );
}

function ProcessCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-h-[250px] rounded-2xl border bg-white/86 p-4 shadow-[0_20px_50px_rgba(17,99,255,0.08)] dark:bg-white/[0.06] ${className}`}
    >
      {children}
    </div>
  );
}

function FlowArrow({ tone }: { tone: 'blue' | 'purple' | 'green' }) {
  const toneClass =
    tone === 'green'
      ? 'text-[#20a35a]'
      : tone === 'purple'
        ? 'text-[#6d4cff]'
        : 'text-[#1163ff] dark:text-[#6ea0ff]';
  return (
    <div className={`hidden justify-center xl:flex ${toneClass}`}>
      <ArrowRight className="h-8 w-8 stroke-[3]" />
    </div>
  );
}

function AgentIcon({ index }: { index: number }) {
  const classes = [
    'bg-zinc-900 text-white',
    'bg-white text-zinc-900 ring-1 ring-black/10',
    'bg-orange-500 text-white',
    'bg-linear-to-br from-blue-500 to-violet-500 text-white',
    'bg-slate-100 text-slate-900',
  ];
  const icons = [
    <Code2 key="cursor" className="h-4 w-4" />,
    <Bot key="codex" className="h-4 w-4" />,
    <Sparkles key="claude" className="h-4 w-4" />,
    <Sparkles key="gemini" className="h-4 w-4" />,
    <span key="more" className="text-lg leading-none">...</span>,
  ];
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${classes[index]}`}>
      {icons[index]}
    </span>
  );
}

function GitBranchIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-10 w-10" fill="none" aria-hidden="true">
      <path d="M10 7v18M22 8v5.5c0 2.5-2 4.5-4.5 4.5H10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="3" />
      <circle cx="10" cy="25" r="3" stroke="currentColor" strokeWidth="3" />
      <circle cx="22" cy="8" r="3" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function BenefitStrip() {
  return (
    <div className="mt-8 rounded-2xl border border-blue-100 bg-white/72 px-4 py-4 shadow-[0_16px_45px_rgba(17,99,255,0.09)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
      <div className="grid gap-3 md:grid-cols-5">
        {benefits.map(benefit => {
          const Icon = benefit.icon;
          return (
            <div key={benefit.title} className="flex items-center gap-3 border-blue-100 px-2 md:border-r md:last:border-r-0 dark:border-white/10">
              <Icon className={`h-8 w-8 shrink-0 ${benefitColor(benefit.tone)}`} />
              <div>
                <div className="font-black">{benefit.title}</div>
                <div className="mt-0.5 text-sm text-[#596681] dark:text-text-muted">{benefit.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function benefitColor(tone: string) {
  if (tone === 'green') return 'text-[#20a35a]';
  if (tone === 'orange') return 'text-[#ff7a22]';
  if (tone === 'purple') return 'text-[#6d4cff]';
  return 'text-[#1163ff] dark:text-[#6ea0ff]';
}
