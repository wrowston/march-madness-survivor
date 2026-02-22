import { describe, expect, test } from "bun:test";
import { baselineWinProbability, futureValuePenalty } from "../src/mastra/workflows/scoring";

type Candidate = {
  team: string;
  seed: number;
  opponent: string;
  opponentSeed: number;
  usedTeams: Set<string>;
};

function evaluateCandidate(candidate: Candidate) {
  if (candidate.usedTeams.has(candidate.team)) return null;
  const winProb = baselineWinProbability(candidate.seed, candidate.opponentSeed);
  const score =
    winProb - futureValuePenalty(candidate.seed, "round_of_64", "balanced");
  return { ...candidate, winProb, score };
}

describe("survivor pool rule integration", () => {
  test("one-team-once blocks reused teams", () => {
    const usedTeams = new Set<string>(["Kansas"]);
    const blocked = evaluateCandidate({
      team: "Kansas",
      seed: 1,
      opponent: "Longwood",
      opponentSeed: 16,
      usedTeams,
    });
    const allowed = evaluateCandidate({
      team: "Marquette",
      seed: 2,
      opponent: "Vermont",
      opponentSeed: 15,
      usedTeams,
    });

    expect(blocked).toBeNull();
    expect(allowed).not.toBeNull();
  });

  test("prefers safer legal option for daily pick", () => {
    const usedTeams = new Set<string>();
    const optionA = evaluateCandidate({
      team: "Seed3",
      seed: 3,
      opponent: "Seed14",
      opponentSeed: 14,
      usedTeams,
    });
    const optionB = evaluateCandidate({
      team: "Seed8",
      seed: 8,
      opponent: "Seed9",
      opponentSeed: 9,
      usedTeams,
    });
    expect(optionA && optionB).toBeTruthy();
    expect(optionA!.score).toBeGreaterThan(optionB!.score);
  });

  test("in round of 64 balanced mode, avoids burning a 1-seed over a 3-seed", () => {
    const usedTeams = new Set<string>();
    const oneSeed = evaluateCandidate({
      team: "TopSeed",
      seed: 1,
      opponent: "SixteenSeed",
      opponentSeed: 16,
      usedTeams,
    });
    const threeSeed = evaluateCandidate({
      team: "ThreeSeed",
      seed: 3,
      opponent: "FourteenSeed",
      opponentSeed: 14,
      usedTeams,
    });

    expect(oneSeed && threeSeed).toBeTruthy();
    expect(threeSeed!.score).toBeGreaterThan(oneSeed!.score);
  });
});
