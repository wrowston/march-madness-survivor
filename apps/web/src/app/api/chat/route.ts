import { MastraClient } from "@mastra/client-js";

const agentId = process.env.MASTRA_AGENT_ID ?? "survivor-pool-agent";
const mastraBaseUrl = process.env.MASTRA_API_URL ?? "http://localhost:4111";

const client = new MastraClient({
  baseUrl: mastraBaseUrl,
});

type ChatRequestBody = {
  messages?: unknown;
};

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as ChatRequestBody;

    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: "Request body must include a non-empty messages array." },
        { status: 400 },
      );
    }

    const agent = client.getAgent(agentId);
    return await agent.stream(messages);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected chat proxy error.";

    return Response.json({ error: message }, { status: 500 });
  }
}
