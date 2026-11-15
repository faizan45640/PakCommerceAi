"use client";

import * as React from "react";

import type { Conversation } from "@pakcommerce/shared/conversations";

import { ConversationInbox } from "./conversation-inbox";
import { ConversationThread } from "./conversation-thread";

/** Inbox on the left, the selected thread on the right. */
export function ConversationsSplitView({ selectedId }: { selectedId?: string }) {
  // A row the thread changed (marked read); the inbox swaps it in.
  const [updated, setUpdated] = React.useState<Conversation | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="xl:col-span-5">
        <ConversationInbox selectedId={selectedId} updatedConversation={updated} />
      </div>
      <div className="xl:col-span-7">
        <ConversationThread
          key={selectedId ?? "none"}
          conversationId={selectedId}
          onConversationUpdated={setUpdated}
        />
      </div>
    </div>
  );
}
