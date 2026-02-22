import { baselineWinProbability, futureValuePenalty } from "../src/mastra/workflows/scoring";

type MockGame = {
  date: string;
  team: string;
  seed: number;
  opponent: string;
  opponentSeed: number;
};

const mockSlate: MockGame[] = [
  { date: "2026-03-19", team: "TeamA", seed: 3, opponent: "TeamB", opponentSeed: 14 },
  { date: "2026-03-20", team: "TeamC", seed: 4, opponent: "TeamD", opponentSeed: 13 },
  { date: "2026-03-21", team: "TeamE", seed: 2, opponent: "TeamF", opponentSeed: 15 },
  { date: "2026-03-22", team: "TeamG", seed: 6, opponent: "TeamH", opponentSeed: 11 },
];

function score(game: MockGame) {
  const winProb = baselineWinProbability(game.seed, game.opponentSeed);
  const preservePenalty = futureValuePenalty(game.seed, "round_of_64", "balanced");
  return winProb - preservePenalty;
}

function runBacktest() {
  const usedTeams = new Set<string>();
  let survivedDays = 0;

  for (const game of mockSlate) {
    if (usedTeams.has(game.team)) {
      console.log(`[${game.date}] skipped ${game.team} (already used)`);
      continue;
    }
    const decisionScore = score(game);
    const pickWinProb = baselineWinProbability(game.seed, game.opponentSeed);
    usedTeams.add(game.team);
    survivedDays += 1;
    console.log(
      `[${game.date}] pick=${game.team} vs ${game.opponent} | score=${decisionScore.toFixed(
        3
      )} | winProb=${pickWinProb.toFixed(3)}`
    );
  }

  console.log(`Backtest complete. Unique teams used: ${usedTeams.size}. Days survived: ${survivedDays}.`);
}

runBacktest();
