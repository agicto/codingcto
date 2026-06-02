# CodingCTO Web

CodingCTO Web is the Next.js console for the PRD-to-PR workflow. It lets users connect repositories, group them into projects, analyze context, generate implementation plans, review PR DAGs, dispatch execution, and monitor pull request delivery.

The package name still contains `luas` for compatibility with the original scaffold history. The public project name is **CodingCTO**.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- shadcn/ui and Radix primitives
- TanStack Query for server state
- Zustand for lightweight client state
- next-intl for internationalization
- Vitest and Testing Library for tests

## Quick Start

### Requirements

- Node.js 20.11+
- pnpm 10+

### Install

```bash
pnpm install
```

### Configure

```bash
cp .env.example .env.local
```

Important local values:

```bash
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_SPECFORGE_API_URL=/v1
LUAS_API_PROXY_TARGET=http://localhost:2010
LUAS_AUTH_BACKEND_ENABLED=false
NEXT_PUBLIC_APP_URL=http://localhost:2020
```

The `LUAS_*` environment keys are compatibility names. They proxy to the CodingCTO API.

### Run

```bash
pnpm dev
```

Open `http://localhost:2020`.

## Main Routes

- `/console` - project and repository console
- `/console/specforge` - repository-scoped SpecForge workflow
- `/console/projects/:projectId/specforge` - project-scoped SpecForge workflow
- `/login` and `/register` - local auth routes

## Project Layout

```text
web/
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/          # shared UI and layout components
│   ├── features/            # feature-first product modules
│   ├── http/                # API client wrapper
│   ├── i18n/                # translations and helpers
│   ├── providers/           # app providers
│   ├── store/               # shared client stores
│   ├── test/                # test setup and utilities
│   └── themes/              # design tokens
├── public/
└── package.json
```

Feature work should live under `src/features/*` unless it is truly shared UI or framework setup.

## Development Commands

```bash
pnpm dev          # start the local dev server
pnpm type-check   # TypeScript check
pnpm lint         # ESLint
pnpm test         # Vitest watch mode
pnpm test run     # one-shot Vitest run
pnpm build        # production build
```

## UI Principles

- Build the actual workflow screen first, not a marketing landing page.
- Keep the console dense, quiet, and work-focused.
- Prefer feature folders and existing shadcn primitives.
- Use semantic theme tokens rather than raw color values.
- Keep controls stable in size across desktop and mobile.
- Verify meaningful UI changes in a browser before opening a PR.

## API Integration

The web app uses local Next.js route handlers as the browser-facing API surface. SpecForge routes proxy to the Go API through `NEXT_PUBLIC_SPECFORGE_API_URL` and `LUAS_API_PROXY_TARGET`.

The API and web app share contracts over HTTP only. Do not import API code into the web app.

## Testing Expectations

For frontend changes, run:

```bash
pnpm type-check
pnpm lint
pnpm test run
```

For visible UI changes, also test the affected route in a browser and include the result in the PR description.

## Compatibility Notes

Some compatibility identifiers still use `luas`. Do not introduce new user-facing `Luas` copy. Public documentation, commit messages, pull request text, and product copy should use **CodingCTO**.
