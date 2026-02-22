import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const ncaaGameTool = createTool({
  id: "get-ncaa-game-details",
  description:
    "Fetches detailed box score and team stats for a specific NCAA Men's Basketball game. Use this to get detailed performance data for analysis.",
  inputSchema: z.object({
    gameId: z.string().describe("The NCAA game ID to fetch details for"),
  }),
  outputSchema: z.object({
    gameId: z.string(),
    status: z.string(),
    homeTeam: z.string(),
    awayTeam: z.string(),
    homeScore: z.number().nullable(),
    awayScore: z.number().nullable(),
    teamStats: z.record(z.string(), z.any()).nullable(),
  }),
  execute: async (inputData) => {
    const gameUrl = `https://ncaa-api.henrygd.me/game/${inputData.gameId}`;
    const statsUrl = `https://ncaa-api.henrygd.me/game/${inputData.gameId}/team-stats`;

    const [gameRes, statsRes] = await Promise.all([
      fetch(gameUrl),
      fetch(statsUrl),
    ]);

    let gameData: any = {};
    if (gameRes.ok) {
      gameData = await gameRes.json();
    }

    let teamStats: Record<string, any> | null = null;
    if (statsRes.ok) {
      teamStats = await statsRes.json();
    }

    const game = gameData.game ?? gameData;
    return {
      gameId: inputData.gameId,
      status: game.gameState ?? game.currentPeriod ?? "unknown",
      homeTeam:
        game.home?.names?.short ?? game.home?.names?.full ?? "Unknown",
      awayTeam:
        game.away?.names?.short ?? game.away?.names?.full ?? "Unknown",
      homeScore: game.home?.score != null ? Number(game.home.score) : null,
      awayScore: game.away?.score != null ? Number(game.away.score) : null,
      teamStats,
    };
  },
});
