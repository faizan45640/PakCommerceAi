"use client";

import Image from "next/image";
import { Package, PackageSearch, TrendingUp, Truck } from "lucide-react";

import { RafiqComposer } from "./rafiq-composer";

export const RAFIQ_SUGGESTIONS = [
  { icon: Package, label: "What’s running low?", prompt: "Which products are low or finished?" },
  {
    icon: TrendingUp,
    label: "My expensive items",
    prompt: "Show my 5 most expensive products and how many pieces I have left.",
  },
  {
    icon: Truck,
    label: "Lahore & Karachi couriers",
    prompt: "How are deliveries going in Lahore and Karachi?",
  },
  {
    icon: PackageSearch,
    label: "How big is my shop?",
    prompt: "How many products are live, and how many sizes do they have?",
  },
] as const;

export function RafiqEmpty({
  input,
  onInputChange,
  onSubmit,
  onSuggestion,
  busy,
}: {
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSuggestion: (prompt: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto px-4 py-4">
      <div className="flex w-full max-w-2xl flex-col items-center">
        <Image
          src="/rafiq-body.png"
          alt="Rafiq"
          width={160}
          height={160}
          priority
          className="h-auto w-[5.5rem] select-none object-contain sm:w-24"
        />
        <p className="mt-1 text-sm font-medium tracking-wide text-[#0F6E66]">Rafiq</p>
        <h1 className="mt-1 text-center text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          Hello. What should we check?
        </h1>
        <p className="mt-1.5 max-w-md text-center text-sm text-muted-foreground">
          Stock, prices, and couriers — from your real shop. Nothing changes until you say yes.
        </p>

        <div className="mt-5 w-full">
          <RafiqComposer
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            busy={busy}
            placeholder="Ask anything about your shop…"
          />
        </div>

        <div className="mt-3 flex w-full flex-wrap justify-center gap-2">
          {RAFIQ_SUGGESTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                disabled={busy}
                onClick={() => onSuggestion(item.prompt)}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
              >
                <Icon className="size-3.5 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
