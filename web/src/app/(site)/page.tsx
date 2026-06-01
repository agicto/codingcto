import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Bot,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Code2,
  Database,
  FileCheck2,
  GitPullRequestArrow,
  Layers3,
  Network,
  Play,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/icons';

const navItems = ['Product', 'How It Works', 'Features', 'Pricing', 'Docs', 'Company'];

const metrics = [
  ['10x', 'Faster Delivery'],
  ['90%', 'Less Manual Work'],
  ['100%', 'Production Ready'],
  ['24/7', 'AI Engineering'],
];

const experts = [
  {
    title: 'Product Expert',
    detail: 'Turns requirements into clear, actionable product specifications.',
    icon: UsersRound,
  },
  {
    title: 'Architecture Expert',
    detail: 'Designs scalable solutions aligned with your systems.',
    icon: Network,
  },
  {
    title: 'QA Expert',
    detail: 'Defines test strategy and ensures quality at every step.',
    icon: ShieldCheck,
  },
  {
    title: 'Code Review Expert',
    detail: 'Reviews code for quality, security, and best practices.',
    icon: Code2,
  },
];

const intelligenceItems = [
  ['Architecture', 'Service structure & boundaries', Layers3],
  ['Database', 'Schemas & relationships', Database],
  ['API', 'Endpoints & contracts', Network],
  ['Dependencies', 'Libraries & versions', Boxes],
  ['Standards', 'Conventions & best practices', ClipboardList],
  ['Test Coverage', 'Current coverage & gaps', FileCheck2],
] satisfies Array<[string, string, LucideIcon]>;

const qualityChecks = [
  ['API Tests', 'All endpoints verified'],
  ['UI Tests', 'Components validated'],
  ['E2E Tests', 'Critical flows tested'],
  ['Security', 'Vulnerabilities scanned'],
  ['Code Review', 'Standards & quality'],
  ['Acceptance Criteria', 'All criteria satisfied'],
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#fbfdff] text-[#07143d]">
      <HeroSection />
      <FeatureSection
        id="product"
        eyebrow="01  Digital Engineering Team"
        title="A World-Class Engineering Team. Built Into Every Repository."
        description="CodingCTO gives each project a product, architecture, QA, and review layer before agents write code."
      >
        <div className="grid gap-5 md:grid-cols-4">
          {experts.map(expert => (
            <InfoCard key={expert.title} icon={expert.icon} title={expert.title} detail={expert.detail} />
          ))}
        </div>
      </FeatureSection>

      <FeatureSection
        id="features"
        eyebrow="02  Repository Intelligence"
        title="Understands Before It Executes."
        description="CodingCTO scans your repository context first: architecture, standards, dependencies, tests, APIs, and project-specific skills."
      >
        <RepositoryIntelligence />
      </FeatureSection>

      <FeatureSection
        eyebrow="03  Execution Plan"
        title="Every Requirement Becomes An Execution Plan."
        description="From intent to plan: structured, traceable, and ready for automated implementation."
      >
        <ExecutionPlan />
      </FeatureSection>

      <FeatureSection
        eyebrow="04  AI Agent Orchestra"
        title="Orchestrates The Best Coding Agents."
        description="CodingCTO routes, reviews, and merges agent output into one coherent delivery path."
      >
        <AgentOrchestra />
      </FeatureSection>

      <FeatureSection
        eyebrow="05  QA & Review"
        title="Never Ship Unverified Code."
        description="Automated testing, security checks, and expert review happen before the pull request is considered ready."
      >
        <QualityReview />
      </FeatureSection>

      <FeatureSection
        eyebrow="06  Production PR"
        title="From Idea To Production PR."
        description="A production-ready pull request with full context, tests, review state, and traceability."
      >
        <ProductionPr />
      </FeatureSection>

      <SiteFooter />
    </main>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-[#dbe7ff]">
      <div className="absolute inset-0 bg-[linear-gradient(115deg,#ffffff_0%,#fbfdff_46%,#eef5ff_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(17,99,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(17,99,255,0.055)_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:linear-gradient(105deg,transparent_0%,black_40%,black_84%,transparent_100%)]" />

      <div className="container relative px-4 py-6 md:px-6 lg:px-10">
        <header className="flex items-center justify-between gap-6">
          <Link href="/" aria-label="CodingCTO home">
            <Logo className="h-8 w-auto md:h-9" />
          </Link>
          <nav className="hidden items-center gap-10 text-sm font-medium text-[#172958] lg:flex">
            {navItems.map(item => (
              <a
                key={item}
                href={`#${item.toLowerCase().replaceAll(' ', '-')}`}
                className="transition-colors hover:text-[#1163ff]"
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="outline"
              className="hidden h-11 rounded-md border-[#d2dff4] bg-white/70 px-7 text-[#07143d] md:inline-flex"
            >
              <Link href="/login">Sign in</Link>
            </Button>
            <Button
              asChild
              className="h-11 rounded-md bg-[#1163ff] px-7 shadow-[0_12px_28px_rgba(17,99,255,0.22)] hover:bg-[#0d55df]"
            >
              <Link href="/console/projects">
                Get Started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="grid min-h-[650px] items-center gap-10 py-12 lg:grid-cols-[0.88fr_1.12fr] lg:py-14">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-md border border-[#dbe7ff] bg-white/72 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#1163ff] shadow-sm">
              <Sparkles className="size-3.5" />
              AI CTO for Engineering Teams
            </div>
            <h1 className="mt-7 text-5xl font-bold leading-[1.05] tracking-normal text-[#061037] md:text-6xl xl:text-7xl">
              The CTO Behind
              <br />
              Your <span className="text-[#1163ff]">Coding Agents</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#485b86] md:text-xl">
              CodingCTO turns requirements into production-ready pull requests through a digital
              engineering team built into every repository.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-md bg-[#1163ff] px-8 shadow-[0_16px_35px_rgba(17,99,255,0.24)] hover:bg-[#0d55df]"
              >
                <Link href="/console/projects">
                  Get Started for Free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-md border-[#d2dff4] bg-white/72 px-7 text-[#07143d]"
              >
                <Link href="#how-it-works">
                  <Play className="size-4" />
                  Watch Demo
                </Link>
              </Button>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-2 rounded-lg border border-[#dbe7ff] bg-white/72 shadow-[0_16px_45px_rgba(17,99,255,0.07)] md:grid-cols-4">
              {metrics.map(([value, label]) => (
                <div key={label} className="border-[#dbe4f3] px-5 py-4 md:border-r md:last:border-r-0">
                  <div className="text-2xl font-semibold text-[#1163ff]">{value}</div>
                  <div className="mt-1 text-xs text-[#506187]">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <HeroMachine />
        </div>
      </div>
    </section>
  );
}

function HeroMachine() {
  return (
    <div className="relative min-h-[540px] overflow-hidden lg:overflow-visible">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(17,99,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(17,99,255,0.06)_1px,transparent_1px)] bg-[size:38px_38px] [transform:perspective(900px)_rotateX(58deg)_rotateZ(-8deg)_translateY(84px)]" />
      <div className="absolute left-1/2 top-[67%] h-28 w-[560px] -translate-x-1/2 -skew-x-6 rounded-[28px] border border-[#c6dcff] bg-white/72 shadow-[0_28px_70px_rgba(17,99,255,0.2)]" />
      <div className="absolute left-1/2 top-[51%] h-56 w-72 -translate-x-1/2 -translate-y-1/2 rounded-[30px] border border-white/80 bg-white/56 shadow-[0_38px_90px_rgba(17,99,255,0.25),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl">
        <div className="absolute inset-3 rounded-[24px] border border-[#d9e7ff] bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(222,237,255,0.48))]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Logo className="h-10 w-auto" />
        </div>
      </div>
      <div className="absolute left-1/2 top-[68%] h-36 w-96 -translate-x-1/2 rounded-[50%] border border-[#88b8ff]" />
      <div className="absolute left-1/2 top-[71%] size-20 -translate-x-1/2 rounded-full bg-[#1163ff]/20 blur-2xl" />

      <FloatingExpert className="left-0 top-16" icon={UsersRound} title="Product Expert" detail="Requirements Strategy" />
      <FloatingExpert className="left-3 top-48" icon={Network} title="Architecture Expert" detail="System Design" />
      <FloatingExpert className="right-0 top-24" icon={ShieldCheck} title="QA Expert" detail="Quality Assurance" />
      <FloatingExpert className="right-6 top-60" icon={Code2} title="Code Review Expert" detail="Code Quality" />

      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 760 540" fill="none" aria-hidden="true">
        <path d="M180 112 C260 112 268 210 352 210" stroke="#1163ff" strokeDasharray="4 4" strokeOpacity="0.5" />
        <path d="M192 240 C270 240 278 250 352 250" stroke="#1163ff" strokeDasharray="4 4" strokeOpacity="0.5" />
        <path d="M405 220 C492 220 515 135 605 135" stroke="#1163ff" strokeDasharray="4 4" strokeOpacity="0.5" />
        <path d="M405 260 C500 260 520 300 592 300" stroke="#1163ff" strokeDasharray="4 4" strokeOpacity="0.5" />
      </svg>
    </div>
  );
}

function FloatingExpert({
  className,
  icon: Icon,
  title,
  detail,
}: {
  className: string;
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={`absolute z-10 flex w-56 items-center gap-3 rounded-lg border border-[#dbe7ff] bg-white/78 p-4 shadow-[0_18px_45px_rgba(17,99,255,0.1)] backdrop-blur-xl ${className}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] text-[#1163ff]">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-[#07143d]">{title}</span>
        <span className="mt-1 block text-xs text-[#506187]">{detail}</span>
      </span>
    </div>
  );
}

function FeatureSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-b border-[#dbe7ff] bg-white">
      <div className="container grid gap-8 px-4 py-14 md:px-6 lg:grid-cols-[280px_1fr] lg:px-10 lg:py-16">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1163ff]">{eyebrow}</div>
          <h2 className="mt-7 text-3xl font-semibold leading-tight tracking-normal text-[#07143d] md:text-4xl">
            {title}
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#506187]">{description}</p>
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

function InfoCard({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="min-h-52 rounded-lg border border-[#dbe7ff] bg-[#fbfdff] p-7 shadow-[0_16px_42px_rgba(17,99,255,0.05)]">
      <Icon className="size-8 text-[#1163ff]" />
      <h3 className="mt-8 text-base font-semibold text-[#07143d]">{title}</h3>
      <p className="mt-4 text-sm leading-6 text-[#506187]">{detail}</p>
    </div>
  );
}

function RepositoryIntelligence() {
  return (
    <div className="rounded-lg border border-[#dbe7ff] bg-[#fbfdff] p-5 shadow-[0_18px_55px_rgba(17,99,255,0.06)]">
      <div className="grid gap-5 lg:grid-cols-[140px_220px_1fr] lg:items-center">
        <div className="rounded-lg border border-[#dbe7ff] bg-white p-5 text-center">
          <Database className="mx-auto size-8 text-[#1163ff]" />
          <div className="mt-4 text-sm font-semibold">Repository</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#ecfff3] px-3 py-1 text-xs font-medium text-[#169447]">
            <span className="size-2 rounded-full bg-[#25b85b]" />
            Live Analysis
          </div>
        </div>
        <div className="space-y-2">
          {intelligenceItems.map(([title, detail, Icon]) => (
            <div key={title} className="flex items-center gap-3 rounded-md border border-[#dbe7ff] bg-white px-3 py-2">
              <Icon className="size-4 text-[#1163ff]" />
              <div>
                <div className="text-xs font-semibold">{title}</div>
                <div className="text-[11px] text-[#617193]">{detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid min-h-72 grid-cols-[0.72fr_1fr] gap-5 rounded-lg border border-[#dbe7ff] bg-white p-5">
          <div className="rounded-md border border-[#dbe7ff] bg-[#f8fbff] p-4">
            <div className="mb-3 flex gap-1">
              <span className="size-2 rounded-full bg-[#dbe7ff]" />
              <span className="size-2 rounded-full bg-[#dbe7ff]" />
              <span className="size-2 rounded-full bg-[#dbe7ff]" />
            </div>
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="mb-3 h-2 rounded-full bg-[#dbe7ff]" style={{ width: `${88 - index * 6}%` }} />
            ))}
          </div>
          <div className="relative rounded-md border border-[#dbe7ff] bg-[#fbfdff]">
            <NetworkLine className="left-[18%] top-[30%]" />
            <NetworkLine className="left-[55%] top-[18%]" />
            <NetworkLine className="left-[42%] top-[62%]" />
            <NetworkBox className="left-[12%] top-[42%]" icon={Database} />
            <NetworkBox className="left-[52%] top-[36%]" icon={UsersRound} />
            <NetworkBox className="right-[10%] top-[16%]" icon={Sparkles} />
            <NetworkBox className="right-[18%] bottom-[16%]" icon={FileCheck2} />
          </div>
        </div>
      </div>
    </div>
  );
}

function NetworkBox({ className, icon: Icon }: { className: string; icon: LucideIcon }) {
  return (
    <div className={`absolute flex size-14 items-center justify-center rounded-md border border-[#dbe7ff] bg-white text-[#9ab7e8] ${className}`}>
      <Icon className="size-5" />
    </div>
  );
}

function NetworkLine({ className }: { className: string }) {
  return <span className={`absolute size-2 rounded-full bg-[#8db8ff] shadow-[0_0_0_5px_rgba(17,99,255,0.08)] ${className}`} />;
}

function ExecutionPlan() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_auto_1.35fr_auto_1fr] lg:items-center">
      <PlanCard title="Requirement">
        <div className="rounded-md border border-[#dbe7ff] bg-[#fbfdff] p-4 text-sm leading-6 text-[#506187]">
          As a team owner, I want to add team-based billing so multiple members can be managed
          under one plan.
        </div>
        <div className="mt-4 flex gap-3 text-xs text-[#506187]">
          <span>Priority: High</span>
          <span>Type: Feature</span>
        </div>
      </PlanCard>
      <ArrowRight className="mx-auto hidden size-6 text-[#8db8ff] lg:block" />
      <PlanCard title="Plan Generation">
        <div className="grid h-52 grid-cols-3 gap-2 rounded-md border border-[#dbe7ff] bg-[#f8fbff] p-4">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="rounded border border-[#bdd3ff] bg-white/70" />
          ))}
        </div>
      </PlanCard>
      <ArrowRight className="mx-auto hidden size-6 text-[#8db8ff] lg:block" />
      <PlanCard title="Execution Plan">
        {['Feature Spec', 'Technical Design', 'PR Breakdown', 'Test Plan', 'Acceptance Criteria'].map(item => (
          <div key={item} className="mb-3 flex items-center gap-3 rounded-md border border-[#dbe7ff] bg-[#fbfdff] px-4 py-3 text-sm font-medium">
            <FileCheck2 className="size-4 text-[#1163ff]" />
            {item}
          </div>
        ))}
      </PlanCard>
    </div>
  );
}

function PlanCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[#dbe7ff] bg-white p-5 shadow-[0_16px_42px_rgba(17,99,255,0.05)]">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#07143d]">
        <FileCheck2 className="size-4 text-[#1163ff]" />
        {title}
      </div>
      {children}
    </div>
  );
}

function AgentOrchestra() {
  return (
    <div className="relative min-h-72 rounded-lg border border-[#dbe7ff] bg-[#fbfdff] p-8">
      <div className="mx-auto flex w-52 flex-col items-center rounded-lg border border-[#a9c8ff] bg-white p-4 shadow-sm">
        <Logo className="h-6 w-auto" />
        <span className="mt-2 text-xs font-semibold text-[#506187]">CodingCTO Orchestrator</span>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <AgentCard name="Codex" detail="Deep Code Generation" />
        <AgentCard name="Cursor" detail="Context-Aware Execution" />
        <AgentCard name="Claude" detail="Reasoning & Refinement" />
      </div>
      <div className="mx-auto mt-8 flex w-fit items-center gap-3 rounded-lg border border-[#dbe7ff] bg-white px-8 py-4 shadow-sm">
        <GitPullRequestArrow className="size-5 text-[#1163ff]" />
        <div>
          <div className="text-sm font-semibold">Production PR</div>
          <div className="text-xs text-[#506187]">Verified. Reviewed. Ready.</div>
        </div>
      </div>
    </div>
  );
}

function AgentCard({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[#dbe7ff] bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Bot className="size-6 text-[#07143d]" />
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-xs text-[#506187]">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function QualityReview() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
      <div className="rounded-lg border border-[#dbe7ff] bg-white p-6 shadow-[0_16px_42px_rgba(17,99,255,0.05)]">
        <div className="mb-4 text-sm font-semibold">Quality Checks</div>
        <div className="space-y-3">
          {qualityChecks.map(([title, detail]) => (
            <div key={title} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 text-[#28a957]" />
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-[#506187]">{detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[#dbe7ff] bg-white p-6 shadow-[0_16px_42px_rgba(17,99,255,0.05)]">
        <div className="rounded-lg border border-[#dbe7ff] bg-[#fbfdff] p-5 text-center">
          <CheckCircle2 className="mx-auto size-10 text-[#28a957]" />
          <div className="mt-3 text-2xl font-semibold text-[#28a957]">Passed</div>
          <div className="mt-1 text-xs text-[#506187]">All checks successful</div>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          {[
            ['Risk', 'Low'],
            ['Coverage', '98%'],
            ['Security', 'No issues'],
            ['Performance', 'Good'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-[#edf3ff] pb-2">
              <span className="text-[#506187]">{label}</span>
              <span className="font-semibold text-[#169447]">{value}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-md bg-[#ecfff3] px-4 py-3 text-sm font-semibold text-[#169447]">
          <CheckCircle2 className="size-4" />
          Ready To Merge
        </div>
      </div>
    </div>
  );
}

function ProductionPr() {
  return (
    <div className="rounded-lg border border-[#dbe7ff] bg-white p-6 shadow-[0_16px_42px_rgba(17,99,255,0.05)]">
      <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <GitPullRequestArrow className="size-5 text-[#1163ff]" />
            <h3 className="text-2xl font-semibold">#128 Add team-based billing</h3>
            <span className="rounded-md bg-[#ecfff3] px-3 py-1 text-xs font-semibold text-[#169447]">
              Ready to Merge
            </span>
          </div>
          <div className="mt-3 text-sm text-[#506187]">feat/billing-team</div>
          <div className="mt-7 grid gap-3 md:grid-cols-4">
            {['Tests Passed', 'Code Reviewed', 'Security Checked', 'Ready To Merge'].map(item => (
              <div key={item} className="rounded-md border border-[#dbe7ff] bg-[#fbfdff] p-4">
                <CheckCircle2 className="size-5 text-[#28a957]" />
                <div className="mt-3 text-sm font-semibold">{item}</div>
                <div className="mt-1 text-xs text-[#506187]">All checks passed</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-[#dbe7ff] bg-[#fbfdff] p-5 text-sm">
          {[
            ['Author', '@engineer'],
            ['Reviewers', '@review-bot, @cto-agent'],
            ['Labels', 'feature, billing'],
            ['Milestone', 'v1.4.0'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-[#edf3ff] py-3 last:border-b-0">
              <span className="text-[#506187]">{label}</span>
              <span className="font-semibold">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-[#051638] text-white">
      <div className="container px-4 py-12 md:px-6 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <Logo className="h-8 w-auto [--logo-ink:#ffffff]" />
            <h2 className="mt-8 text-3xl font-semibold leading-tight tracking-normal">
              The CTO Behind Your Coding Agents.
              <br />
              <span className="text-[#2e7bff]">Build Software That Evolves Itself.</span>
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#9fb1d2]">
              An engineering operating system for the future of software delivery.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {['Intelligent By Design', 'Engineered For Trust', 'Built For Scale', 'Always Evolving'].map(item => (
              <div key={item} className="rounded-lg border border-white/10 p-4 text-sm text-[#c4d2ee]">
                <Sparkles className="mb-4 size-5 text-[#7babff]" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-[#9fb1d2] md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-6">
            {navItems.concat(['Careers', 'Privacy', 'Terms']).map(item => (
              <a key={item} href="#" className="hover:text-white">
                {item}
              </a>
            ))}
          </div>
          <div>© 2026 CodingCTO. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
