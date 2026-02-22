import { describe, expect, test } from "bun:test";
import {
  applyFirstRoundSeedPreference,
  baselineWinProbability,
  futureValuePenalty,
  inferRoundByGameCount,
} from "../src/mastra/workflows/scoring";

describe("scoring helpers", () => {
  test("uses historical seed baseline for 1v16", () => {
    const p = baselineWinProbability(1, 16);
    expect(p).toBeGreaterThan(0.99);
  });

  test("penalizes top seeds more in balanced mode", () => {
    const balanced = futureValuePenalty(1, "round_of_64", "balanced");
    const aggressive = futureValuePenalty(1, "round_of_64", "win_pool");
    expect(balanced).toBeGreaterThan(aggressive);
  });

  test("maps game counts to expected round buckets", () => {
    expect(inferRoundByGameCount(32)).toBe("round_of_64");
    expect(inferRoundByGameCount(16)).toBe("round_of_64");
    expect(inferRoundByGameCount(14)).toBe("round_of_32");
    expect(inferRoundByGameCount(8)).toBe("round_of_32");
    expect(inferRoundByGameCount(2)).toBe("elite_8");
  });

  test("first-round preference focuses on seeds 4-10", () => {
    const options = [
      { seed: 1, winProbability: 0.99 },
      { seed: 3, winProbability: 0.85 },
      { seed: 6, winProbability: 0.63 },
      { seed: 9, winProbability: 0.60 },
      { seed: 12, winProbability: 0.40 },
    ];

    const preferred = applyFirstRoundSeedPreference(options);
    expect(preferred.map((o) => o.seed)).toEqual([6, 9]);
  });

  test("first-round preference falls back when 4-10 seeds are too risky", () => {
    const options = [
      { seed: 1, winProbability: 0.99 },
      { seed: 4, winProbability: 0.55 },
      { seed: 9, winProbability: 0.52 },
    ];

    const preferred = applyFirstRoundSeedPreference(options);
    expect(preferred.map((o) => o.seed)).toEqual([4, 9]);
  });
});
