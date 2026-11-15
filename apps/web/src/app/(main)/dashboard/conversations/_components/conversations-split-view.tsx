"use client";

import * as React from "react";

import type { Conversation } from "@pakcommerce/shared/conversations";

import { BuyerSimulator } from "./buyer-simulator";
import { ConversationCustomerPanel } from "./conversation-customer-panel";
import { ConversationOrders } from "./conversation-orders";
import { ConversationInbox } from "./conversation-inbox";
import { isWaitingApproval } from "./conversation-orders-model";
import { ConversationThread } from "./conversation-thread";
import { OrderApprovalCard } from "./order-approval-card";

/** Inbox on the left, the selected thread on the right. */
export function ConversationsSplitView({ selectedId }: { selectedId?: string }) {
  // A row the thread changed (marked read); the inbox swaps it in.
  const [updated, setUpdated] = React.useState<Conversation | null>(null);
  // Bumped by the buyer simulator while it waits for the AI, so inbox and thread reload quietly.
  const [refreshTick, setRefreshTick] = React.useState(0);
  const bumpRefresh = React.useCallback(() => setRefreshTick((tick) => tick + 1), []);

  return (
    <div className="flex flex-col gap-4">
      <BuyerSimulator onActivity={bumpRefresh} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <ConversationInbox selectedId={selectedId} updatedConversation={updated} refreshTick={refreshTick} />
        </div>
        <div className="xl:col-span-5">
          <ConversationThread
            key={selectedId ?? "none"}
            conversationId={selectedId}
            onConversationUpdated={setUpdated}
            refreshTick={refreshTick}
            renderApproval={(conversation) =>
              isWaitingApproval(conversation) ? (
                <OrderApprovalCard
                  key={conversation.id}
                  conversation={conversation}
                  onDecided={(next) => {
                    setUpdated(next);
                    bumpRefresh();
                  }}
                />
              ) : null
            }
            renderBuyerReply={(conversation) => (
              <BuyerSimulator
                key={conversation.id}
                onActivity={bumpRefresh}
                buyer={{ phone: conversation.buyerPhone, name: conversation.buyerName }}
              />
            )}
          />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-3">
          <ConversationCustomerPanel
            key={selectedId ?? "none"}
            conversationId={selectedId}
            updatedConversation={updated}
          />
          <ConversationOrders
            key={selectedId ?? "none"}
            conversationId={selectedId}
            updatedConversation={updated}
            refreshTick={refreshTick}
          />
        </div>
      </div>
    </div>
  );
}
