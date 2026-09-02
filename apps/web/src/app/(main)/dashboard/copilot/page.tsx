import { NaturalLanguageQuery } from "./_components/natural-language-query";

export default function CopilotPage() {
  return (
    <div className="flex h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <NaturalLanguageQuery />
    </div>
  );
}