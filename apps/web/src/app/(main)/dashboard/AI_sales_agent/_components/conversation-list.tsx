// conversation-list.tsx
"use client";

import { ArrowRight, Bot, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const conversations = [
  {
    id: "CONV-2024-0062",
    customer: "Aisha Khan",
    status: "Active",
    messages: 12,
    time: "2 mins ago",
    hasDraftOrder: true,
  },
  {
    id: "CONV-2024-0061",
    customer: "Omar Hassan",
    status: "Awaiting Response",
    messages: 8,
    time: "15 mins ago",
    hasDraftOrder: false,
  },
  {
    id: "CONV-2024-0060",
    customer: "Zara Malik",
    status: "Active",
    messages: 23,
    time: "28 mins ago",
    hasDraftOrder: true,
  },
  {
    id: "CONV-2024-0059",
    customer: "Imran Sheikh",
    status: "Completed",
    messages: 14,
    time: "1 hour ago",
    hasDraftOrder: true,
  },
  {
    id: "CONV-2024-0058",
    customer: "Fatima Ali",
    status: "Active",
    messages: 6,
    time: "1.5 hours ago",
    hasDraftOrder: false,
  },
];

function StatusBadge({ status }: { status: string }) {
  const config = {
    Active: { className: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300" },
    "Awaiting Response": { className: "bg-yellow-500/10 border-yellow-600/50 text-yellow-700 dark:text-yellow-300" },
    Completed: { className: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300" },
  };
  
  const { className } = config[status as keyof typeof config] || config.Active;
  
  return (
    <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${className}`}>
      {status}
    </Badge>
  );
}

export function ConversationList() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="size-4 text-muted-foreground" />
          Active Conversations
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          View All <ArrowRight className="size-4" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border">
          {conversations.map((conv) => (
            <div key={conv.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{conv.customer}</span>
                    <StatusBadge status={conv.status} />
                    {conv.hasDraftOrder && (
                      <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600">
                        Draft Order
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{conv.messages} messages</span>
                    <span>•</span>
                    <span>{conv.time}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0">
                  <Bot className="size-3 mr-1" />
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}