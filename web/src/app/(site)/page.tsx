import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  FileCheck2,
  GitPullRequestArrow,
  Play,
  Sparkles,
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

const expertImages = [
  {
    title: 'Product Expert',
    src: '/landing/product-expert.png',
  },
  {
    title: 'Architecture Expert',
    src: '/landing/architecture-expert.png',
  },
  {
    title: 'QA Expert',
    src: '/landing/qa-expert.png',
  },
  {
    title: 'Code Review Expert',
    src: '/landing/code-review-expert.png',
  },
];

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
          {expertImages.map(expert => (
            <ExpertImageCard key={expert.title} src={expert.src} title={expert.title} />
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
    <div className="relative overflow-hidden lg:overflow-visible">
      <Image
        src="/landing/hero-cto-machine.png"
        alt="CodingCTO orchestration engine"
        width={1448}
        height={1086}
        priority
        className="h-auto w-full scale-110 object-contain lg:scale-125"
      />
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

function ExpertImageCard({ src, title }: { src: string; title: string }) {
  return (
    <Image
      src={src}
      alt={title}
      width={1122}
      height={1402}
      className="h-auto w-full rounded-lg object-contain"
    />
  );
}

function RepositoryIntelligence() {
  return (
    <Image
      src="/landing/repository-intelligence.png"
      alt="Repository intelligence analysis"
      width={1448}
      height={1086}
      className="h-auto w-full rounded-lg object-contain"
    />
  );
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
    <Image
      src="/landing/production-pr.png"
      alt="Production-ready pull request"
      width={1586}
      height={992}
      className="h-auto w-full rounded-lg object-contain"
    />
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
