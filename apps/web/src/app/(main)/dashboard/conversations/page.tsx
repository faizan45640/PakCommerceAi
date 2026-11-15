import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AgentConfidenceIndicator } from "./_components/agent-confidence-indicator";
import { AgentKpiStrip } from "./_components/agent-kpi-strip";
import { AgentSettings } from "./_components/agent-settings";
import { ConversationInbox } from "./_components/conversation-inbox";
import { ConversationThread } from "./_components/conversation-thread";
import { TopCustomerQuestions } from "./_components/top-customer-questions";

interface ConversationsPageProps {
  searchParams: Promise<{ c?: string | string[] }>;
}

export default async function ConversationsPage({ searchParams }: ConversationsPageProps) {
  const { c } = await searchParams;
  const selectedId = (Array.isArray(c) ? c[0] : c)?.trim() || undefined;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Conversations"
        description="Manage AI-powered buyer chats, monitor confidence, and tune the WhatsApp sales agent."
        actions={<StatusBadge label="Buyer AI" tone="info" />}
      />

      <p className="text-muted-foreground text-xs">
        Sample figures: the metrics below are placeholders until live agent analytics ship.
      </p>
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
              <ConversationInbox selectedId={selectedId} />
            </div>
            <div className="xl:col-span-7">
              <ConversationThread key={selectedId ?? "none"} conversationId={selectedId} />
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
