import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const seedWinRates: Record<string, number> = {
  "1-16": 0.993,
  "2-15": 0.944,
  "3-14": 0.848,
  "4-13": 0.786,
  "5-12": 0.643,
  "6-11": 0.632,
  "7-10": 0.605,
  "8-9": 0.516,
};

function getSeedBaselineProb(teamSeed: number, opponentSeed: number): number {
  if (teamSeed <= 0 || opponentSeed <= 0) {
    return 0.5;
  }

  const favoriteSeed = Math.min(teamSeed, opponentSeed);
  const underdogSeed = Math.max(teamSeed, opponentSeed);
  const key = `${favoriteSeed}-${underdogSeed}`;
  const favoriteProb = seedWinRates[key];

  if (favoriteProb == null) {
    // Fallback heuristic when we are outside common bracket pairings.
    const edge = Math.max(-0.35, Math.min(0.35, (opponentSeed - teamSeed) * 0.03));
    return Math.max(0.05, Math.min(0.95, 0.5 + edge));
  }

  return teamSeed < opponentSeed ? favoriteProb : 1 - favoriteProb;
}

export const historicalTournamentTool = createTool({
  id: "get-historical-tournament-context",
  description:
    "Returns historical NCAA tournament seed win-rate context and baseline probabilities for candidate matchups.",
  inputSchema: z.object({
    matchups: z
      .array(
        z.object({
          team: z.string(),
          opponent: z.string(),
          teamSeed: z.number().nullable(),
          opponentSeed: z.number().nullable(),
        })
      )
      .describe("Potential team-opponent matchups to baseline"),
  }),
  outputSchema: z.object({
    globalSeedWinRates: z.record(z.string(), z.number()),
    matchups: z.array(
      z.object({
        team: z.string(),
        opponent: z.string(),
        teamSeed: z.number().nullable(),
        opponentSeed: z.number().nullable(),
        baselineWinProb: z.number(),
      })
    ),
  }),
  execute: async ({ matchups }) => {
    return {
      globalSeedWinRates: seedWinRates,
      matchups: matchups.map((m) => ({
        ...m,
        baselineWinProb:
          m.teamSeed != null && m.opponentSeed != null
            ? getSeedBaselineProb(m.teamSeed, m.opponentSeed)
            : 0.5,
      })),
    };
  },
});
