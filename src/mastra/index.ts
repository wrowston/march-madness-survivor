import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { survivorPoolAgent } from "./agents/survivor-pool-agent.js";
import { storage, initCustomTables } from "./tools/db.js";

// Initialize custom tables on startup
initCustomTables().catch((err) => {
  console.error("Failed to initialize custom tables:", err);
});

export const mastra = new Mastra({
  agents: { survivorPoolAgent },
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
