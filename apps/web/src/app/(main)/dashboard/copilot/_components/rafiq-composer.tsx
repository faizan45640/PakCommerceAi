"use client";

import { ArrowUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RafiqComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  placeholder = "Ask Rafiq about your shop…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim() || disabled || busy) return;
        onSubmit();
      }}
      className={cn(
        "flex items-end gap-2 rounded-[1.75rem] border border-border/80 bg-card/90 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-[border-color,box-shadow] focus-within:border-foreground/20 focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_rgba(0,0,0,0.06)]",
        className,
      )}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!value.trim() || disabled || busy) return;
            onSubmit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled || busy}
        rows={1}
        className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || busy || !value.trim()}
        className="mb-0.5 size-9 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-25"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </Button>
    </form>
  );
}
