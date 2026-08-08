import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AutoApprovalRules } from "./_components/auto-approval-rules";
import { DraftOrdersQueue } from "./_components/draft-orders-queue";
import { HumanHandoffAlerts } from "./_components/human-handoff-alerts";

export default function ApprovalsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Approvals"
        description="Review AI draft orders, handoff alerts, and auto-approval rules before they affect the business."
        actions={<StatusBadge label="Human-in-loop" tone="warning" />}
      />

      <Tabs defaultValue="drafts" className="flex flex-col gap-4">
        <TabsList className="gap-1">
          <TabsTrigger value="drafts">Draft Orders</TabsTrigger>
          <TabsTrigger value="handoffs">Handoff Alerts</TabsTrigger>
          <TabsTrigger value="rules">Auto-Approval Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="flex flex-col gap-4">
          <DraftOrdersQueue />
        </TabsContent>

        <TabsContent value="handoffs" className="flex flex-col gap-4">
          <HumanHandoffAlerts />
        </TabsContent>

        <TabsContent value="rules" className="flex flex-col gap-4">
          <AutoApprovalRules />
        </TabsContent>
      </Tabs>
    </div>
  );
}
