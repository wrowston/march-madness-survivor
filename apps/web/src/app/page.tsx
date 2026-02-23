"use client";

import dynamic from "next/dynamic";

const SurvivorAssistant = dynamic(
  () =>
    import("@/components/survivor-assistant").then(
      (module) => module.SurvivorAssistant,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-white/70">
        Loading assistant...
      </div>
    ),
  },
);

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b1020] p-4 text-white sm:p-8">
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/15 bg-black/30 shadow-2xl sm:h-[calc(100vh-4rem)]">
        <header className="border-b border-white/10 px-4 py-3 sm:px-6">
          <h1 className="text-lg font-semibold">March Madness Survivor Assistant</h1>
          <p className="text-sm text-white/70">
            Ask for today&apos;s safest pick, risk-aware options, and team-preservation strategy.
          </p>
        </header>
        <div className="min-h-0 flex-1">
          <SurvivorAssistant />
        </div>
      </div>
    </main>
  );
}
