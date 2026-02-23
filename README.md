# mclaude

A Claude Code automation tool that queues multiple prompts for sequential execution with automatic rate limit handling and retry with exponential backoff.

## Features

- **Prompt Queue Management** — Drag-and-drop reordering, CRUD operations
- **Execution Plans** — Combine global and plan-level prompts into execution plans
- **Sequential Auto-Execution** — Execute queued prompts one by one via Claude Code CLI
- **Automatic Rate Limit Handling** — Detects rate limits via exit codes, stream events, and text patterns; retries with exponential backoff (5min~40min)
- **Real-time Monitoring** — SSE-based streaming for live output and tool usage tracking
- **Execution History** — Stores cost, duration, and output logs in SQLite
- **Pause/Resume/Stop** — Queue control during execution

## Tech Stack

- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Next.js API Routes (App Router)
- **DB**: better-sqlite3 (SQLite)
- **Unit Test**: Vitest
- **E2E Test**: Playwright

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Access at http://localhost:3000.

## Project Structure

```
src/
├── app/
│   ├── api/           # API Routes (prompts, plans, run, history, settings)
│   ├── history/       # Execution history page
│   ├── plans/         # Execution plans page
│   ├── prompts/       # Prompt management page
│   ├── run/           # Execution monitoring page
│   └── settings/      # Settings page
├── components/
│   ├── layout/        # AppLayout
│   └── ui/            # Button, Badge, Modal, Toast
├── hooks/             # useRunStatus, useSSE
├── lib/
│   ├── claude-executor.ts    # Claude CLI process management
│   ├── run-manager.ts        # Queue execution engine (singleton)
│   ├── stream-parser.ts      # stream-json parsing
│   ├── rate-limit-detector.ts # Rate limit detection
│   ├── db.ts                 # SQLite data layer
│   └── types.ts              # Type definitions
└── types/
tests/
├── unit/              # Vitest unit tests
└── e2e/               # Playwright E2E tests
```

## Scripts

```bash
npm run dev            # Dev server (http://localhost:3000)
npm run build          # Production build
npm run lint           # ESLint
npm test               # Unit tests
npm run test:watch     # Unit tests in watch mode
npm run test:e2e       # E2E tests
npm run test:e2e:headed # E2E tests (headed browser)
```

## License

Apache 2.0
