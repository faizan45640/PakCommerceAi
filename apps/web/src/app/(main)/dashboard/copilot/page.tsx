import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";

import { AiActionAuditLog } from "./_components/ai-action-audit-log";
import { AiConfidenceMeter } from "./_components/ai-confidence-meter";
import { AiKpiCards } from "./_components/ai-kpi-cards";
import { AutomatedInsightCards } from "./_components/automated-insight-cards";
import { InsightCategories } from "./_components/insight-categories";
import { NaturalLanguageQuery } from "./_components/natural-language-query";
import { QueryHistory } from "./_components/query-history";
import { QuickActions } from "./_components/quick-actions";

export default function CopilotPage() {
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <PageHeader
        title="Business Copilot"
        description="Ask business questions and review explainable AI insights grounded in your workspace data."
        actions={<StatusBadge label="Seller AI" tone="info" />}
      />

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