import { createTool } from "@mastra/core/tools";
import { z } from "zod";

function americanToImpliedProbability(price: number): number {
  if (price === 0) return 0.5;
  if (price > 0) return 100 / (price + 100);
  return Math.abs(price) / (Math.abs(price) + 100);
}

type Moneyline = { name: string; price: number };

function normalizeTwoWayMarket(outcomes: Moneyline[]): Moneyline[] {
  if (outcomes.length !== 2) return outcomes;

  const probs = outcomes.map((o) => americanToImpliedProbability(o.price));
  const total = probs[0] + probs[1];
  if (total <= 0) return outcomes;

  return outcomes.map((o, idx) => ({
    name: o.name,
    price: probs[idx] / total,
  }));
}

export const oddsNormalizationTool = createTool({
  id: "normalize-ncaa-odds",
  description:
    "Normalizes NCAA odds into consensus implied win probabilities by team.",
  inputSchema: z.object({
    games: z.array(
      z.object({
        id: z.string(),
        homeTeam: z.string(),
        awayTeam: z.string(),
        bookmakers: z.array(
          z.object({
            title: z.string(),
            markets: z.array(
              z.object({
                key: z.string(),
                outcomes: z.array(
                  z.object({
                    name: z.string(),
                    price: z.number(),
                    point: z.number().optional(),
                  })
                ),
              })
            ),
          })
        ),
      })
    ),
  }),
  outputSchema: z.object({
    games: z.array(
      z.object({
        id: z.string(),
        homeTeam: z.string(),
        awayTeam: z.string(),
        consensusWinProb: z.record(z.string(), z.number()),
        averageSpread: z.record(z.string(), z.number()).optional(),
      })
    ),
  }),
  execute: async ({ games }) => {
    const normalizedGames = games.map((game) => {
      const moneylineByTeam = new Map<string, number[]>();
      const spreadByTeam = new Map<string, number[]>();

      for (const bookmaker of game.bookmakers) {
        const h2h = bookmaker.markets.find((m) => m.key === "h2h");
        if (h2h && h2h.outcomes.length >= 2) {
          const normalized = normalizeTwoWayMarket(
            h2h.outcomes.map((o) => ({ name: o.name, price: o.price }))
          );
          for (const outcome of normalized) {
            if (!moneylineByTeam.has(outcome.name)) {
              moneylineByTeam.set(outcome.name, []);
            }
            moneylineByTeam.get(outcome.name)!.push(outcome.price);
          }
        }

        const spreads = bookmaker.markets.find((m) => m.key === "spreads");
        if (spreads) {
          for (const outcome of spreads.outcomes) {
            if (outcome.point == null) continue;
            if (!spreadByTeam.has(outcome.name)) {
              spreadByTeam.set(outcome.name, []);
            }
            spreadByTeam.get(outcome.name)!.push(outcome.point);
          }
        }
      }

      const consensusWinProb: Record<string, number> = {};
      for (const [team, probs] of moneylineByTeam) {
        const avg = probs.reduce((sum, value) => sum + value, 0) / probs.length;
        consensusWinProb[team] = avg;
      }

      const averageSpread: Record<string, number> = {};
      for (const [team, spreads] of spreadByTeam) {
        averageSpread[team] =
          spreads.reduce((sum, value) => sum + value, 0) / spreads.length;
      }

      return {
        id: game.id,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        consensusWinProb,
        ...(Object.keys(averageSpread).length ? { averageSpread } : {}),
      };
    });

    return { games: normalizedGames };
  },
});
