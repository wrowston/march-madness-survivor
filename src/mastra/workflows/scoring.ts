export const seedWinRates: Record<string, number> = {
  "1-16": 0.993,
  "2-15": 0.944,
  "3-14": 0.848,
  "4-13": 0.786,
  "5-12": 0.643,
  "6-11": 0.632,
  "7-10": 0.605,
  "8-9": 0.516,
};

export function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function inferRoundByGameCount(gameCount: number) {
  // Daily slates are split across days in March Madness:
  // round of 64 ~16 games/day, round of 32 ~8/day, sweet 16 ~4/day.
  if (gameCount >= 16) return "round_of_64";
  if (gameCount >= 8) return "round_of_32";
  if (gameCount >= 4) return "sweet_16";
  if (gameCount >= 2) return "elite_8";
  return "championship";
}

export function futureValuePenalty(
  seed: number | null,
  round: string,
  riskMode: string
): number {
  if (seed == null) return 0.04;
  const multiplier = riskMode === "balanced" ? 1 : 0.6;
  if (round === "round_of_64") {
    // Round 1 should strongly preserve 1/2 seeds for later rounds.
    if (seed <= 2) return 0.30 * multiplier;
    if (seed <= 4) return 0.08 * multiplier;
    return 0.03 * multiplier;
  }
  if (round === "round_of_32") {
    if (seed <= 2) return 0.14 * multiplier;
    if (seed <= 4) return 0.07 * multiplier;
    return 0.03 * multiplier;
  }
  if (round === "sweet_16") {
    if (seed <= 2) return 0.06 * multiplier;
    if (seed <= 4) return 0.03 * multiplier;
    return 0.02 * multiplier;
  }
  return 0.01;
}

export function baselineWinProbability(
  teamSeed: number | null,
  opponentSeed: number | null
): number {
  if (teamSeed == null || opponentSeed == null) return 0.5;
  const favoriteSeed = Math.min(teamSeed, opponentSeed);
  const underdogSeed = Math.max(teamSeed, opponentSeed);
  const key = `${favoriteSeed}-${underdogSeed}`;
  const favoriteProb = seedWinRates[key];
  if (favoriteProb == null) {
    const edge = Math.max(-0.35, Math.min(0.35, (opponentSeed - teamSeed) * 0.03));
    return clamp(0.5 + edge, 0.05, 0.95);
  }
  return teamSeed < opponentSeed ? favoriteProb : 1 - favoriteProb;
}

type CandidateOption = {
  seed: number | null;
  winProbability: number;
};

export function applyFirstRoundSeedPreference<T extends CandidateOption>(
  options: T[]
) {
  const preferredSeeds = options.filter(
    (option) => option.seed != null && option.seed >= 4 && option.seed <= 10
  );
  if (!preferredSeeds.length) return options;

  // Keep first-round picks practical by requiring a reasonable survival floor.
  const safePreferred = preferredSeeds.filter(
    (option) => option.winProbability >= 0.58
  );
  return safePreferred.length ? safePreferred : preferredSeeds;
}
