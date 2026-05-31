import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  DollarSign,
  FileCode2,
  MessageSquareText,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TestTube2,
  TrendingUp,
  UsersRound,
  Zap,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/icons';

const teamRoles = [
  { name: '产品专家', detail: '需求分析 / 方案规划' },
  { name: '架构专家', detail: '技术设计 / 架构规划' },
  { name: 'UI/UX 专家', detail: '交互设计 / 体验优化' },
  { name: 'QA 专家', detail: '测试策略 / 质量保障' },
];

const knowledgeItems = ['深度理解仓库', '最佳实践知识', '实施方案生成', '任务拆解规划'];

const agents = [
  'Cursor',
  'Codex',
  'Claude Code',
  'Gemini CLI',
  '更多 Agent',
];

const qualityItems = [
  '单元测试',
  'API 测试',
  'UI / E2E 测试',
  '回归测试',
  '代码审查',
  '安全扫描',
];

const deliveryItems = ['自动创建 PR', '测试报告', '代码审查报告', '风险评估', '可直接合并'];

const benefits = [
  { icon: Zap, title: '交付更快', detail: '10x 更快的交付速度', tone: 'blue' },
  { icon: Target, title: '质量更高', detail: '标准化流程保障质量', tone: 'purple' },
  { icon: ShieldCheck, title: '风险更低', detail: '自动化测试与审查', tone: 'green' },
  { icon: DollarSign, title: '成本更优', detail: '节省研发时间与成本', tone: 'orange' },
  { icon: TrendingUp, title: '持续进化', detail: '持续优化与知识沉淀', tone: 'blue' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-[#07143d] dark:bg-bg-canvas dark:text-text-main">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(17,99,255,0.16),transparent_30%),radial-gradient(circle_at_85%_8%,rgba(99,102,241,0.12),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f7fbff_62%,#ffffff_100%)] dark:bg-[radial-gradient(circle_at_15%_0%,rgba(110,160,255,0.18),transparent_30%),radial-gradient(circle_at_85%_8%,rgba(99,102,241,0.16),transparent_28%),linear-gradient(180deg,#050916_0%,#07101f_62%,#050916_100%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-blue-300 to-transparent" />

        <div className="container relative py-10 md:py-14 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <div className="space-y-6">
              <Logo className="h-14 w-auto md:h-16" />
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-normal md:text-5xl">
                  让每个仓库拥有世界级数字研发团队
                </h1>
                <p className="text-lg font-medium leading-8 text-[#596681] dark:text-text-subtle md:text-xl">
                  从需求到生产级 PR，自动化交付
                  <span className="mx-1 text-[#1163ff] dark:text-[#6ea0ff]">高质量</span>
                  软件
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="h-11 rounded-full px-6">
                  <Link href="/console/projects">
                    进入项目
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="h-11 rounded-full px-6">
                  <Link href="/console/settings?tab=github">连接 GitHub</Link>
                </Button>
              </div>
            </div>

            <div className="rounded-[28px] border border-blue-100/80 bg-white/72 p-3 shadow-[0_30px_90px_rgba(17,99,255,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
              <WorkflowDiagram />
            </div>
          </div>

          <BenefitStrip />

          <div className="mx-auto mt-8 w-fit rounded-xl border border-blue-100 bg-blue-50/80 px-6 py-3 text-center text-lg font-bold text-[#1c2d68] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-text-main">
            CodingCTO = 数字研发团队 + AI 代理 + 自动化质量保障
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkflowDiagram() {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.78fr_auto_1.85fr_auto_1.05fr_auto_0.92fr_auto_0.95fr] xl:items-center">
      <InputStage />
      <FlowArrow tone="blue" />
      <TeamStage />
      <FlowArrow tone="purple" />
      <AgentStage />
      <FlowArrow tone="blue" />
      <QualityStage />
      <FlowArrow tone="green" />
      <DeliveryStage />
    </div>
  );
}

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
