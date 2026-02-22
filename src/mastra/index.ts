import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { survivorPoolAgent } from "./agents/survivor-pool-agent.js";
import { storage, initCustomTables } from "./tools/db.js";
import { survivorDailyWorkflow } from "./workflows/index.js";
import { startDailySurvivorScheduler } from "./workflows/scheduler.js";

// Block startup until Mastra + custom tables exist to avoid race conditions
// where workflow recovery queries run before schema creation on fresh databases.
try {
  await initCustomTables();
} catch (err) {
  console.error("Failed to initialize storage tables:", err);
  throw err;
}

export const mastra = new Mastra({
  agents: { survivorPoolAgent },
  workflows: { survivorDailyWorkflow },
  storage,
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  server: {
    cors: {
      origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
      credentials: true,
    },
  },
});

startDailySurvivorScheduler(survivorDailyWorkflow);
