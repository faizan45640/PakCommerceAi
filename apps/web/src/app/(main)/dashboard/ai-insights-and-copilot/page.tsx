// page.tsx
import { AiKpiCards } from "./_components/ai-kpi-cards";
import { NaturalLanguageQuery } from "./_components/natural-language-query";
import { AutomatedInsightCards } from "./_components/automated-insight-cards";
import { AiActionAuditLog } from "./_components/ai-action-audit-log";
import { InsightCategories } from "./_components/insight-categories";
import { AiConfidenceMeter } from "./_components/ai-confidence-meter";
import { QuickActions } from "./_components/quick-actions";
import { QueryHistory } from "./_components/query-history";

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <AiKpiCards />
      
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 min-w-0">
          <NaturalLanguageQuery />
        </div>
        <div className="xl:col-span-4 min-w-0">
          <QuickActions />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0">
          <AutomatedInsightCards />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 min-w-0">
          <InsightCategories />
        </div>
        <div className="xl:col-span-4 min-w-0">
          <AiConfidenceMeter />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0">
          <QueryHistory />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0">
          <AiActionAuditLog />
        </div>
      </div>
    </div>
  );
}