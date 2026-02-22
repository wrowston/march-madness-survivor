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
  picks: Array<{
    pick_date: string;
    team_name: string;
    team_seed: number | null;
    opponent: string | null;
    opponent_seed: number | null;
    round: string | null;
    confidence: number | null;
    reasoning: string | null;
    result: string;
  }>;
  teamsUsed: string[];
}> {
  const picks = await storage.db.any(
    `SELECT pick_date, team_name, team_seed, opponent, opponent_seed, round, confidence, reasoning, result
     FROM survivor_picks
     WHERE user_id = $1 AND tournament_year = $2
     ORDER BY pick_date ASC`,
    [userId, tournamentYear]
  );
  const teamsUsed = picks.map((p: { team_name: string }) => p.team_name);
  return { picks, teamsUsed };
}
