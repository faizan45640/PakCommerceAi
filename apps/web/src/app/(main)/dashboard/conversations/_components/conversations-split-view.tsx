"use client";

import * as React from "react";

import { ConversationInbox } from "./conversation-inbox";

/** Inbox on the left, the selected thread (`children`) on the right. */
export function ConversationsSplitView({
  selectedId,
  children,
}: {
  selectedId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <div className="xl:col-span-5">
        <ConversationInbox selectedId={selectedId} />
      </div>
      <div className="xl:col-span-7">{children}</div>
    </div>
  );
}
