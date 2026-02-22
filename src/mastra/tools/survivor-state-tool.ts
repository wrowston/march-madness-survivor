import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { recordPick, getPicksHistory } from "./db.js";

export const recordSurvivorPickTool = createTool({
  id: "record-survivor-pick",
  description:
    "Records a survivor pool pick to the database. Validates that the team hasn't been used before and no pick exists for that date. Call this ONLY after the user confirms their pick.",
  inputSchema: z.object({
    userId: z
      .string()
      .optional()
      .describe("User ID. Defaults to 'default'"),
    tournamentYear: z.number().describe("Tournament year, e.g. 2026"),
    pickDate: z
      .string()
      .describe("Date of the pick in YYYY-MM-DD format"),
    teamName: z.string().describe("Name of the team being picked"),
    teamSeed: z.number().optional().describe("Seed of the picked team"),
    opponent: z
      .string()
      .optional()
      .describe("Name of the opponent team"),
    opponentSeed: z
      .number()
      .optional()
      .describe("Seed of the opponent team"),
    round: z
      .string()
      .optional()
      .describe(
        "Tournament round, e.g. 'First Round', 'Second Round', 'Sweet 16', 'Elite Eight', 'Final Four', 'Championship'"
      ),
    confidence: z
      .number()
      .optional()
      .describe("Confidence level 1-100"),
    reasoning: z
      .string()
      .optional()
      .describe("Brief explanation for the pick"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    error: z.string().optional(),
    message: z.string().optional(),
  }),
  execute: async (inputData) => {
    const result = await recordPick({
      userId: inputData.userId ?? "default",
      tournamentYear: inputData.tournamentYear,
      pickDate: inputData.pickDate,
      teamName: inputData.teamName,
      teamSeed: inputData.teamSeed,
      opponent: inputData.opponent,
      opponentSeed: inputData.opponentSeed,
      round: inputData.round,
      confidence: inputData.confidence,
      reasoning: inputData.reasoning,
    });

    if (result.success) {
      return {
        success: true,
        message: `Pick recorded: ${inputData.teamName} for ${inputData.pickDate}`,
      };
    }
    return { success: false, error: result.error };
  },
});

export const getPicksHistoryTool = createTool({
  id: "get-picks-history",
  description:
    "Retrieves all survivor pool picks made so far, including which teams have been used. Use this to check what teams are still available before making a recommendation.",
  inputSchema: z.object({
    userId: z
      .string()
      .optional()
      .describe("User ID. Defaults to 'default'"),
    tournamentYear: z.number().describe("Tournament year, e.g. 2026"),
  }),
  outputSchema: z.object({
    picks: z.array(
      z.object({
        pick_date: z.string(),
        team_name: z.string(),
        team_seed: z.number().nullable(),
        opponent: z.string().nullable(),
        opponent_seed: z.number().nullable(),
        round: z.string().nullable(),
        confidence: z.number().nullable(),
        reasoning: z.string().nullable(),
        result: z.string(),
      })
    ),
    teamsUsed: z.array(z.string()),
  }),
  execute: async (inputData) => {
    return await getPicksHistory(
      inputData.userId ?? "default",
      inputData.tournamentYear
    );
  },
});
