# march-madness-survivor

Mastra backend for a March Madness survivor pool assistant and daily workflow.

## Core capabilities

- `survivorPoolAgent`: conversational assistant for pick analysis
- `survivorDailyWorkflow`: deterministic daily pick workflow
- Survivor constraints:
  - one-team-once per tournament
  - elimination on loss
  - one pick required per game day
- Data inputs:
  - NCAA schedule/game endpoints
  - betting odds
  - historical seed win-rate baselines
  - web research signals

## Local development

1. Copy `.env.example` to `.env` and fill values.
2. Start dev server:

```bash
npm run dev
```

Run backend + frontend together:

```bash
npm run dev:all
```

Run frontend only:

```bash
npm run dev:web
```

3. Build:

```bash
npm run build
```

## Testing and backtesting

- Unit + integration checks:

```bash
npm run test
```

- Run a simple historical-style simulation harness:

```bash
npm run backtest
```

## Railway deployment (backend only)

This repo includes `railway.json` for deployment defaults.

## assistant-ui frontend (same repo)

The frontend lives in `apps/web` and uses `assistant-ui` with a server route proxy at `apps/web/src/app/api/chat/route.ts` to call the Mastra agent.

### Frontend environment variables

- `MASTRA_API_URL` (default: `http://localhost:4111`)
- `MASTRA_AGENT_ID` (default: `survivor-pool-agent`)

### Railway in same repo

Use two Railway services pointing at this repo:

1. **api service**
   - Start command: `npm run start`
   - Uses root `railway.json` defaults
2. **web service**
   - Root directory: `apps/web`
   - Build command: `npm run build`
   - Start command: `npm run start`
   - Set `MASTRA_API_URL` to the public URL of the api service

Set backend `FRONTEND_URL` to the public URL of the web service so CORS is aligned.

### Required environment variables

- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `DEFAULT_MODEL` (example: `openrouter/openai/gpt-4o-mini`)
- `ODDS_API_KEY`
- `EXA_API_KEY`
- `FRONTEND_URL` (allowed CORS origin)

### Optional scheduler variables

- `ENABLE_DAILY_SURVIVOR_SCHEDULER=true`
- `SCHEDULER_USER_ID=default`
- `SCHEDULER_TOURNAMENT_YEAR=2026`
- `SCHEDULER_RISK_MODE=balanced`

When enabled, the scheduler attempts a workflow run every hour and safely skips non-game days.
