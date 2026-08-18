import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AgentConfidenceIndicator } from "./_components/agent-confidence-indicator";
import { AgentKpiStrip } from "./_components/agent-kpi-strip";
import { AgentSettings } from "./_components/agent-settings";
import { ConversationList } from "./_components/conversation-list";
import { ConversationTranscript } from "./_components/conversation-transcript";
import { TopCustomerQuestions } from "./_components/top-customer-questions";

export default function ConversationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Conversations"
        description="Manage AI-powered buyer chats, monitor confidence, and tune the WhatsApp sales agent."
        actions={<StatusBadge label="Buyer AI" tone="info" />}
      />

      <AgentKpiStrip />

      <Tabs defaultValue="conversations" className="flex flex-col gap-4">
        <TabsList className="gap-1">
          <TabsTrigger value="conversations">Inbox</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="settings">Agent Settings</TabsTrigger>
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

        <TabsContent value="performance" className="flex flex-col gap-4">
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
          <AgentSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
