import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const ncaaScheduleTool = createTool({
  id: "get-ncaa-schedule",
  description:
    "Fetches the NCAA Men's Basketball tournament schedule for a specific date. Returns a list of games with teams, seeds, times, and status.",
  inputSchema: z.object({
    date: z
      .string()
      .describe("Date in YYYY-MM-DD format to fetch games for"),
  }),
  outputSchema: z.object({
    date: z.string(),
    games: z.array(
      z.object({
        gameId: z.string(),
        status: z.string(),
        startTime: z.string(),
        homeTeam: z.string(),
        homeSeed: z.number().nullable(),
        homeScore: z.number().nullable(),
        awayTeam: z.string(),
        awaySeed: z.number().nullable(),
        awayScore: z.number().nullable(),
      })
    ),
  }),
  execute: async (inputData) => {
    const [year, month, day] = inputData.date.split("-");
    const url = `https://ncaa-api.henrygd.me/scoreboard/basketball-men/d1/${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;

    const response = await fetch(url);
    if (!response.ok) {
      return { date: inputData.date, games: [] };
    }

    const data = await response.json();
    const games = (data.games ?? []).map((g: any) => {
      const game = g.game;
      return {
        gameId: String(game.gameID ?? g.gameID ?? ""),
        status: game.gameState ?? game.currentPeriod ?? "unknown",
        startTime: game.startTimeEpoch
          ? new Date(Number(game.startTimeEpoch) * 1000).toISOString()
          : game.startTime ?? "",
        homeTeam: game.home?.names?.short ?? game.home?.names?.full ?? "Unknown",
        homeSeed: game.home?.seed ? Number(game.home.seed) : null,
        homeScore: game.home?.score != null ? Number(game.home.score) : null,
        awayTeam: game.away?.names?.short ?? game.away?.names?.full ?? "Unknown",
        awaySeed: game.away?.seed ? Number(game.away.seed) : null,
        awayScore: game.away?.score != null ? Number(game.away.score) : null,
      };
    });

    return { date: inputData.date, games };
  },
});
