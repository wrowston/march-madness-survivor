import type { AnyWorkflow } from "@mastra/core/workflows";

function currentDateUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function startDailySurvivorScheduler(workflow: AnyWorkflow) {
  const enabled = process.env.ENABLE_DAILY_SURVIVOR_SCHEDULER === "true";
  if (!enabled) return;

  const userId = process.env.SCHEDULER_USER_ID ?? "default";
  const tournamentYear = Number(
    process.env.SCHEDULER_TOURNAMENT_YEAR ?? new Date().getUTCFullYear()
  );
  const riskMode =
    process.env.SCHEDULER_RISK_MODE === "win_pool" ? "win_pool" : "balanced";

  const runOnce = async () => {
    const pickDate = currentDateUtc();
    try {
      const run = await workflow.createRun();
      await run.start({
        inputData: {
          userId,
          tournamentYear,
          pickDate,
          riskMode,
        },
      });
    } catch (error) {
      console.error("Daily survivor scheduler run failed:", error);
    }
  };

  // Kick once at startup, then hourly; workflow itself handles game-day skips.
  runOnce().catch((error) => {
    console.error("Initial scheduler run failed:", error);
  });
  setInterval(() => {
    runOnce().catch((error) => {
      console.error("Scheduled survivor run failed:", error);
    });
  }, 60 * 60 * 1000);
}
