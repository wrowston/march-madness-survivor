import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  applyFirstRoundSeedPreference,
  baselineWinProbability,
  clamp,
  futureValuePenalty,
  inferRoundByGameCount,
} from "./scoring.js";
import { getTournamentSnapshot, upsertRecommendation, upsertWorkflowDailyRun } from "../tools/db.js";

const inputSchema = z.object({
  userId: z.string().default("default"),
  tournamentYear: z.number(),
  pickDate: z.string(),
  riskMode: z.enum(["balanced", "win_pool"]).default("balanced"),
});

const optionSchema = z.object({
  team: z.string(),
  seed: z.number().nullable(),
  opponent: z.string(),
  opponentSeed: z.number().nullable(),
  gameId: z.string(),
  score: z.number(),
  winProbability: z.number(),
  confidence: z.number(),
  rationale: z.string(),
});

const outputSchema = z.object({
  status: z.enum(["recommended", "already-picked", "eliminated", "no-games", "no-legal-picks"]),
  recommendedPick: optionSchema.nullable(),
  alternates: z.array(optionSchema),
  eliminationRisk: z.number(),
  reasons: z.array(z.string()),
  dataSourcesUsed: z.array(z.string()),
  strategyGuidelines: z.array(z.string()),
});

const contextSchema = z.object({
  userId: z.string(),
  tournamentYear: z.number(),
  pickDate: z.string(),
  riskMode: z.enum(["balanced", "win_pool"]),
  teamsUsed: z.array(z.string()),
  isEliminated: z.boolean(),
  existingPick: z.object({ team: z.string() }).nullable(),
  games: z.array(
    z.object({
      gameId: z.string(),
      homeTeam: z.string(),
      awayTeam: z.string(),
      homeSeed: z.number().nullable(),
      awaySeed: z.number().nullable(),
    })
  ),
});

type OddsMap = Record<string, Record<string, number>>;

async function fetchSchedule(date: string) {
  const [y, m, d] = date.split("-");
  const res = await fetch(
    `https://ncaa-api.henrygd.me/scoreboard/basketball-men/d1/${y}/${m.padStart(2, "0")}/${d.padStart(2, "0")}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.games ?? []).map((g: any) => ({
    gameId: String(g.game?.gameID ?? g.gameID ?? ""),
    homeTeam: g.game?.home?.names?.short ?? "Unknown",
    awayTeam: g.game?.away?.names?.short ?? "Unknown",
    homeSeed: g.game?.home?.seed ? Number(g.game.home.seed) : null,
    awaySeed: g.game?.away?.seed ? Number(g.game.away.seed) : null,
  }));
}

async function fetchOddsMap(): Promise<OddsMap> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return {};
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds?apiKey=${key}&regions=us&markets=h2h&oddsFormat=american`
  );
  if (!res.ok) return {};
  const rows = (await res.json()) as Array<any>;
  const map: OddsMap = {};
  for (const row of rows) {
    const outcomes = row.bookmakers?.[0]?.markets?.find((m: any) => m.key === "h2h")?.outcomes;
    if (!outcomes) continue;
    const probs = outcomes.map((o: any) => {
      const p = o.price > 0 ? 100 / (o.price + 100) : Math.abs(o.price) / (Math.abs(o.price) + 100);
      return { name: o.name, p };
    });
    const total = probs.reduce((sum: number, o: any) => sum + o.p, 0);
    map[row.id] = Object.fromEntries(probs.map((o: any) => [o.name, total ? o.p / total : 0.5]));
  }
  return map;
}

const startStep = createStep({
  id: "start-run",
  inputSchema,
  outputSchema: inputSchema,
  execute: async ({ inputData }) => {
    await upsertWorkflowDailyRun({
      userId: inputData.userId,
      tournamentYear: inputData.tournamentYear,
      pickDate: inputData.pickDate,
      workflowId: "survivor-daily-workflow",
      runStatus: "started",
      sources: [],
      summary: { message: "started" },
    });
    return inputData;
  },
});

const contextStep = createStep({
  id: "context",
  inputSchema,
  outputSchema: contextSchema,
  execute: async ({ inputData }) => {
    const snapshot = await getTournamentSnapshot(inputData.userId, inputData.tournamentYear, inputData.pickDate);
    return {
      ...inputData,
      teamsUsed: snapshot.teamsUsed,
      isEliminated: snapshot.isEliminated,
      existingPick: snapshot.pickAlreadyMadeForDate ? { team: snapshot.pickAlreadyMadeForDate.team_name } : null,
      games: await fetchSchedule(inputData.pickDate),
    };
  },
});

const ingestStep = createStep({
  id: "ingest",
  inputSchema: contextSchema,
  outputSchema: z.object({
    context: contextSchema,
    odds: z.record(z.string(), z.record(z.string(), z.number())),
  }),
  execute: async ({ inputData }) => ({
    context: inputData,
    odds: await fetchOddsMap(),
  }),
});

const decideStep = createStep({
  id: "decide",
  inputSchema: z.object({ context: contextSchema, odds: z.record(z.string(), z.record(z.string(), z.number())) }),
  outputSchema,
  execute: async ({ inputData }) => {
    const c = inputData.context;
    const guidelines = [
      "Never pick a team twice in the same tournament.",
      "Prioritize survival while preserving top seeds early.",
      "Avoid close games when safer legal options exist.",
    ];
    if (c.isEliminated) return { status: "eliminated" as const, recommendedPick: null, alternates: [], eliminationRisk: 1, reasons: ["User eliminated"], dataSourcesUsed: ["survivor_picks"], strategyGuidelines: guidelines };
    if (c.existingPick) return { status: "already-picked" as const, recommendedPick: null, alternates: [], eliminationRisk: 0, reasons: ["Pick already exists"], dataSourcesUsed: ["survivor_picks"], strategyGuidelines: guidelines };
    if (!c.games.length) return { status: "no-games" as const, recommendedPick: null, alternates: [], eliminationRisk: 0, reasons: ["No games today"], dataSourcesUsed: ["ncaa_schedule"], strategyGuidelines: guidelines };

    const round = inferRoundByGameCount(c.games.length);
    const used = new Set(c.teamsUsed);
    const options: z.infer<typeof optionSchema>[] = [];
    let usedOddsApi = false;
    let usedHistoricalBaseline = false;
    for (const g of c.games) {
      for (const row of [
        { team: g.homeTeam, seed: g.homeSeed, opponent: g.awayTeam, opponentSeed: g.awaySeed },
        { team: g.awayTeam, seed: g.awaySeed, opponent: g.homeTeam, opponentSeed: g.homeSeed },
      ]) {
        if (used.has(row.team)) continue;
        const oddsWinProb = inputData.odds[g.gameId]?.[row.team];
        const winProb = oddsWinProb ?? baselineWinProbability(row.seed, row.opponentSeed);
        if (oddsWinProb != null) usedOddsApi = true;
        else usedHistoricalBaseline = true;
        const penalty = futureValuePenalty(row.seed, round, c.riskMode);
        const score = clamp(winProb - penalty, 0, 1);
        options.push({
          team: row.team,
          seed: row.seed,
          opponent: row.opponent,
          opponentSeed: row.opponentSeed,
          gameId: g.gameId,
          score: Number(score.toFixed(4)),
          winProbability: Number(winProb.toFixed(4)),
          confidence: Math.round(score * 100),
          rationale: `winProb=${winProb.toFixed(3)} preservePenalty=${penalty.toFixed(3)}`,
        });
      }
    }
    if (!options.length) return { status: "no-legal-picks" as const, recommendedPick: null, alternates: [], eliminationRisk: 1, reasons: ["No legal team left"], dataSourcesUsed: ["survivor_picks", "ncaa_schedule"], strategyGuidelines: guidelines };

    const candidateOptions =
      round === "round_of_64" ? applyFirstRoundSeedPreference(options) : options;
    candidateOptions.sort((a, b) => b.score - a.score);

    const usedSeedRangePreference =
      round === "round_of_64" && candidateOptions.length < options.length;
    return {
      status: "recommended" as const,
      recommendedPick: candidateOptions[0],
      alternates: candidateOptions.slice(1, 3),
      eliminationRisk: Number((1 - candidateOptions[0].winProbability).toFixed(4)),
      reasons: [
        usedSeedRangePreference
          ? `Selected ${candidateOptions[0].team} after applying first-round seed preference (4-10).`
          : `Selected ${candidateOptions[0].team} for best adjusted survival score.`,
      ],
      dataSourcesUsed: [
        "survivor_picks",
        "ncaa_schedule",
        ...(usedOddsApi ? ["odds_api"] : []),
        ...(usedHistoricalBaseline ? ["historical_seed_baseline_internal"] : []),
      ],
      strategyGuidelines: guidelines,
    };
  },
});

const persistStep = createStep({
  id: "persist",
  inputSchema: outputSchema,
  outputSchema,
  execute: async ({ inputData, getInitData }) => {
    const init = getInitData<z.infer<typeof inputSchema>>();
    await upsertRecommendation({
      userId: init.userId,
      tournamentYear: init.tournamentYear,
      pickDate: init.pickDate,
      recommendedTeam: inputData.recommendedPick?.team ?? null,
      recommendedSeed: inputData.recommendedPick?.seed ?? undefined,
      opponent: inputData.recommendedPick?.opponent ?? undefined,
      opponentSeed: inputData.recommendedPick?.opponentSeed ?? undefined,
      confidence: inputData.recommendedPick?.confidence ?? undefined,
      score: inputData.recommendedPick?.score ?? undefined,
      rationale: inputData.reasons[0],
      rankedOptions: [inputData.recommendedPick, ...inputData.alternates].filter(Boolean),
      metadata: { status: inputData.status, eliminationRisk: inputData.eliminationRisk },
    });
    await upsertWorkflowDailyRun({
      userId: init.userId,
      tournamentYear: init.tournamentYear,
      pickDate: init.pickDate,
      workflowId: "survivor-daily-workflow",
      runStatus: inputData.status === "recommended" ? "completed" : "skipped",
      sources: inputData.dataSourcesUsed,
      summary: { status: inputData.status, team: inputData.recommendedPick?.team ?? null },
    });
    return inputData;
  },
});

export const survivorDailyWorkflow = createWorkflow({
  id: "survivor-daily-workflow",
  inputSchema,
  outputSchema,
})
  .then(startStep)
  .then(contextStep)
  .then(ingestStep)
  .then(decideStep)
  .then(persistStep)
  .commit();
