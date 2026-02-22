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
