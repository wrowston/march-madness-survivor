import { PostgresStore } from "@mastra/pg";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create a .env file with:\n" +
    "DATABASE_URL=postgresql://user:password@host:5432/dbname\n\n" +
    "For Railway: copy the DATABASE_URL from your Railway PostgreSQL service."
  );
}

export const storage = new PostgresStore({
  id: "march-madness-storage",
  connectionString: process.env.DATABASE_URL,
});

export async function initCustomTables(): Promise<void> {
  // Wait for PostgresStore to be ready (creates mastra_* tables)
  await storage.init();

  await storage.db.none(`
    CREATE TABLE IF NOT EXISTS survivor_picks (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      tournament_year INT NOT NULL,
      pick_date DATE NOT NULL,
      team_name TEXT NOT NULL,
      team_seed INT,
      opponent TEXT,
      opponent_seed INT,
      round TEXT,
      confidence INT,
      reasoning TEXT,
      result TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, tournament_year, pick_date),
      UNIQUE(user_id, tournament_year, team_name)
    )
  `);

  await storage.db.none(`
    CREATE TABLE IF NOT EXISTS tournament_state (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      tournament_year INT NOT NULL,
      is_eliminated BOOLEAN DEFAULT FALSE,
      current_round TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, tournament_year)
    )
  `);

  await storage.db.none(`
    CREATE TABLE IF NOT EXISTS survivor_recommendations (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      tournament_year INT NOT NULL,
      pick_date DATE NOT NULL,
      recommended_team TEXT,
      recommended_seed INT,
      opponent TEXT,
      opponent_seed INT,
      confidence INT,
      score NUMERIC,
      rationale TEXT,
      ranked_options JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, tournament_year, pick_date)
    )
  `);

  await storage.db.none(`
    CREATE TABLE IF NOT EXISTS workflow_daily_runs (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      tournament_year INT NOT NULL,
      pick_date DATE NOT NULL,
      workflow_id TEXT NOT NULL,
      run_status TEXT NOT NULL,
      sources JSONB NOT NULL DEFAULT '[]'::jsonb,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_text TEXT,
      run_started_at TIMESTAMPTZ DEFAULT NOW(),
      run_finished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, tournament_year, pick_date, workflow_id)
    )
  `);
}

export interface SurvivorPick {
  userId: string;
  tournamentYear: number;
  pickDate: string;
  teamName: string;
  teamSeed?: number;
  opponent?: string;
  opponentSeed?: number;
  round?: string;
  confidence?: number;
  reasoning?: string;
}

type PickRow = {
  pick_date: string;
  team_name: string;
  team_seed: number | null;
  opponent: string | null;
  opponent_seed: number | null;
  round: string | null;
  confidence: number | null;
  reasoning: string | null;
  result: string;
};

export interface SurvivorRecommendation {
  userId: string;
  tournamentYear: number;
  pickDate: string;
  recommendedTeam: string | null;
  recommendedSeed?: number;
  opponent?: string;
  opponentSeed?: number;
  confidence?: number;
  score?: number;
  rationale?: string;
  rankedOptions: unknown[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowDailyRun {
  userId: string;
  tournamentYear: number;
  pickDate: string;
  workflowId: string;
  runStatus: "started" | "completed" | "failed" | "skipped";
  sources: string[];
  summary?: Record<string, unknown>;
  errorText?: string;
}

export async function recordPick(pick: SurvivorPick): Promise<{ success: boolean; error?: string }> {
  try {
    await storage.db.none(
      `INSERT INTO survivor_picks (user_id, tournament_year, pick_date, team_name, team_seed, opponent, opponent_seed, round, confidence, reasoning)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        pick.userId,
        pick.tournamentYear,
        pick.pickDate,
        pick.teamName,
        pick.teamSeed ?? null,
        pick.opponent ?? null,
        pick.opponentSeed ?? null,
        pick.round ?? null,
        pick.confidence ?? null,
        pick.reasoning ?? null,
      ]
    );
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("survivor_picks_user_id_tournament_year_team_name_key")) {
      return { success: false, error: `Team "${pick.teamName}" has already been used this tournament.` };
    }
    if (message.includes("survivor_picks_user_id_tournament_year_pick_date_key")) {
      return { success: false, error: `A pick has already been made for ${pick.pickDate}.` };
    }
    return { success: false, error: message };
  }
}

export async function getPicksHistory(
  userId: string,
  tournamentYear: number
): Promise<{
  picks: PickRow[];
  teamsUsed: string[];
}> {
  const picks: PickRow[] = await storage.db.any(
    `SELECT pick_date, team_name, team_seed, opponent, opponent_seed, round, confidence, reasoning, result
     FROM survivor_picks
     WHERE user_id = $1 AND tournament_year = $2
     ORDER BY pick_date ASC`,
    [userId, tournamentYear]
  );
  const teamsUsed = picks.map((p: { team_name: string }) => p.team_name);
  return { picks, teamsUsed };
}

export async function getTournamentSnapshot(
  userId: string,
  tournamentYear: number,
  pickDate: string
): Promise<{
  picks: PickRow[];
  teamsUsed: string[];
  isEliminated: boolean;
  pickAlreadyMadeForDate: PickRow | null;
}> {
  const { picks, teamsUsed } = await getPicksHistory(userId, tournamentYear);
  const isEliminated = picks.some((p) => p.result.toLowerCase() === "loss");
  const pickAlreadyMadeForDate =
    picks.find((p) => p.pick_date.slice(0, 10) === pickDate) ?? null;
  return { picks, teamsUsed, isEliminated, pickAlreadyMadeForDate };
}

export async function upsertRecommendation(
  recommendation: SurvivorRecommendation
): Promise<void> {
  await storage.db.none(
    `INSERT INTO survivor_recommendations (
      user_id, tournament_year, pick_date, recommended_team, recommended_seed, opponent, opponent_seed,
      confidence, score, rationale, ranked_options, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
    ON CONFLICT (user_id, tournament_year, pick_date)
    DO UPDATE SET
      recommended_team = EXCLUDED.recommended_team,
      recommended_seed = EXCLUDED.recommended_seed,
      opponent = EXCLUDED.opponent,
      opponent_seed = EXCLUDED.opponent_seed,
      confidence = EXCLUDED.confidence,
      score = EXCLUDED.score,
      rationale = EXCLUDED.rationale,
      ranked_options = EXCLUDED.ranked_options,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()`,
    [
      recommendation.userId,
      recommendation.tournamentYear,
      recommendation.pickDate,
      recommendation.recommendedTeam,
      recommendation.recommendedSeed ?? null,
      recommendation.opponent ?? null,
      recommendation.opponentSeed ?? null,
      recommendation.confidence ?? null,
      recommendation.score ?? null,
      recommendation.rationale ?? null,
      JSON.stringify(recommendation.rankedOptions ?? []),
      JSON.stringify(recommendation.metadata ?? {}),
    ]
  );
}

export async function upsertWorkflowDailyRun(run: WorkflowDailyRun): Promise<void> {
  await storage.db.none(
    `INSERT INTO workflow_daily_runs (
      user_id, tournament_year, pick_date, workflow_id, run_status, sources, summary, error_text,
      run_started_at, run_finished_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,
      CASE WHEN $5 = 'started' THEN NOW() ELSE NULL END,
      CASE WHEN $5 IN ('completed', 'failed', 'skipped') THEN NOW() ELSE NULL END
    )
    ON CONFLICT (user_id, tournament_year, pick_date, workflow_id)
    DO UPDATE SET
      run_status = EXCLUDED.run_status,
      sources = EXCLUDED.sources,
      summary = EXCLUDED.summary,
      error_text = EXCLUDED.error_text,
      run_started_at = COALESCE(workflow_daily_runs.run_started_at, EXCLUDED.run_started_at),
      run_finished_at = EXCLUDED.run_finished_at,
      updated_at = NOW()`,
    [
      run.userId,
      run.tournamentYear,
      run.pickDate,
      run.workflowId,
      run.runStatus,
      JSON.stringify(run.sources ?? []),
      JSON.stringify(run.summary ?? {}),
      run.errorText ?? null,
    ]
  );
}
