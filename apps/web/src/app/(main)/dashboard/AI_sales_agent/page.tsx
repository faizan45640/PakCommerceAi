// page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AgentKpiStrip } from "./_components/agent-kpi-strip";
import { DraftOrdersQueue } from "./_components/draft-orders-queue";
import { ConversationTranscript } from "./_components/conversation-transcript";
import { HumanHandoffAlerts } from "./_components/human-handoff-alerts";
import { AutoApprovalRules } from "./_components/auto-approval-rules";
import { TopCustomerQuestions } from "./_components/top-customer-questions";
import { AgentConfidenceIndicator } from "./_components/agent-confidence-indicator";
import { ConversationList } from "./_components/conversation-list";
import { AgentSettings } from "./_components/agent-settings";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">WhatsApp AI Sales Agent</h1>
        <p className="text-muted-foreground text-sm">
          Manage AI-powered conversations, review draft orders, and monitor agent performance.
        </p>
      </div>

      <AgentKpiStrip />

      <Tabs defaultValue="conversations" className="flex flex-col gap-4">
        <TabsList className="gap-1">
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="drafts">Draft Orders</TabsTrigger>
          <TabsTrigger value="handoffs">Handoff Alerts</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="conversations" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <ConversationList />
            </div>
            <div className="xl:col-span-7">
              <ConversationTranscript />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafts" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <DraftOrdersQueue />
            <AutoApprovalRules />
          </div>
        </TabsContent>

        <TabsContent value="handoffs" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <HumanHandoffAlerts />
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-6">
              <AgentConfidenceIndicator />
            </div>
            <div className="xl:col-span-6">
              <TopCustomerQuestions />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <AgentSettings />
            <AutoApprovalRules />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}