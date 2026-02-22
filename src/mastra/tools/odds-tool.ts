import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const oddsTool = createTool({
  id: "get-ncaa-odds",
  description:
    "Fetches current betting odds (moneylines, spreads, totals) for NCAA Men's Basketball games from The Odds API. Use this to assess win probability and identify strong favorites.",
  inputSchema: z.object({
    regions: z
      .string()
      .optional()
      .describe("Comma-separated regions: us, uk, eu, au. Defaults to 'us'"),
    markets: z
      .string()
      .optional()
      .describe(
        "Comma-separated markets: h2h (moneyline), spreads, totals. Defaults to 'h2h,spreads'"
      ),
  }),
  outputSchema: z.object({
    games: z.array(
      z.object({
        id: z.string(),
        homeTeam: z.string(),
        awayTeam: z.string(),
        commenceTime: z.string(),
        bookmakers: z.array(
          z.object({
            key: z.string(),
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
  execute: async (inputData) => {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return { games: [] };
    }

    const regions = inputData.regions ?? "us";
    const markets = inputData.markets ?? "h2h,spreads";
    const url = `https://api.the-odds-api.com/v4/sports/basketball_ncaab/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=american`;

    const response = await fetch(url);
    if (!response.ok) {
      return { games: [] };
    }

    const data: any[] = await response.json();

    const games = data.map((game: any) => ({
      id: game.id,
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      commenceTime: game.commence_time,
      bookmakers: (game.bookmakers ?? []).map((bk: any) => ({
        key: bk.key,
        title: bk.title,
        markets: (bk.markets ?? []).map((m: any) => ({
          key: m.key,
          outcomes: (m.outcomes ?? []).map((o: any) => ({
            name: o.name,
            price: o.price,
            ...(o.point != null ? { point: o.point } : {}),
          })),
        })),
      })),
    }));

    return { games };
  },
});
