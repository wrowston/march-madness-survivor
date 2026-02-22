import { MCPClient } from "@mastra/mcp";

export const exaMcpClient = new MCPClient({
  id: "exa-mcp-client",
  servers: {
    exa: {
      url: new URL("https://mcp.exa.ai/mcp"),
      requestInit: {
        headers: {
          "x-api-key": process.env.EXA_API_KEY!,
        },
      },
    },
  },
});
