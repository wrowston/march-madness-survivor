import { createTool } from "@mastra/core/tools";
import { z } from "zod";

type ExaSearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    publishedDate?: string;
    text?: string;
  }>;
};

async function queryExa(query: string, maxResults: number) {
  const key = process.env.EXA_API_KEY;
  if (!key) return [];

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query,
      type: "keyword",
      numResults: maxResults,
      contents: { text: true },
      useAutoprompt: true,
    }),
  });

  if (!response.ok) return [];
  const json = (await response.json()) as ExaSearchResponse;
  return json.results ?? [];
}

function inferSignal(text: string): "positive" | "negative" | "neutral" {
  const normalized = text.toLowerCase();
  if (/(injury|out|suspended|questionable|limited|fatigue|illness)/.test(normalized)) {
    return "negative";
  }
  if (/(healthy|dominant|hot streak|momentum|efficient|elite defense|depth)/.test(normalized)) {
    return "positive";
  }
  return "neutral";
}

export const webResearchAggregationTool = createTool({
  id: "get-web-research-aggregation",
  description:
    "Searches the web for NCAA tournament context (injuries, recent form, matchup notes) and returns lightweight signals per team.",
  inputSchema: z.object({
    tournamentYear: z.number(),
    teams: z.array(z.string()),
    maxResultsPerTeam: z.number().optional(),
  }),
  outputSchema: z.object({
    teamSignals: z.array(
      z.object({
        team: z.string(),
        signal: z.enum(["positive", "negative", "neutral"]),
        confidence: z.number(),
        notes: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
          })
        ),
      })
    ),
  }),
  execute: async ({ tournamentYear, teams, maxResultsPerTeam }) => {
    const perTeam = Math.max(1, Math.min(maxResultsPerTeam ?? 3, 5));
    const teamSignals = [];

    for (const team of teams) {
      const query = `${team} ${tournamentYear} NCAA tournament injury report recent form`;
      const rows = await queryExa(query, perTeam);
      const notes = rows.map((r) => ({
        title: r.title ?? "Untitled",
        url: r.url ?? "",
        snippet: (r.text ?? "").slice(0, 240),
      }));

      const signalVotes = notes.map((n) =>
        inferSignal(`${n.title} ${n.snippet}`)
      );
      const positive = signalVotes.filter((v) => v === "positive").length;
      const negative = signalVotes.filter((v) => v === "negative").length;
      const neutral = signalVotes.filter((v) => v === "neutral").length;

      let signal: "positive" | "negative" | "neutral" = "neutral";
      if (positive > negative && positive >= neutral) signal = "positive";
      if (negative > positive && negative >= neutral) signal = "negative";

      const confidenceBase = notes.length ? Math.min(0.85, 0.4 + notes.length * 0.1) : 0.2;
      const confidence =
        signal === "neutral" ? Math.max(0.15, confidenceBase - 0.15) : confidenceBase;

      teamSignals.push({
        team,
        signal,
        confidence,
        notes,
      });
    }

    return { teamSignals };
  },
});
