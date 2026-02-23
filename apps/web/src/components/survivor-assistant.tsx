"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@assistant-ui/react-ui";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo } from "react";

export function SurvivorAssistant() {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
      }),
    [],
  );

  const chat = useChat({
    transport,
  });

  const runtime = useAISDKRuntime(chat);

  useEffect(() => {
    transport.setRuntime(runtime);
  }, [runtime, transport]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="h-full">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
