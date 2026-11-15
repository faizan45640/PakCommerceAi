"use client";

import * as React from "react";

import { Bot } from "lucide-react";
import type { AiActivity, Conversation } from "@pakcommerce/shared/conversations";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { fetchAiActivity } from "@/lib/api/conversations";

import { AI_STATE_HEADLINES, AI_STATE_TONES, handoffLine, lastAiActionLine } from "./ai-status-model";

/**
 * Compact AI status under the thread header. State and handoff reason come from
 * the conversation itself; the last AI action comes from the activity endpoint,
 * which is re-read whenever `refreshKey` changes (thread reload, state change,
 * new messages).
 */
export function AiStatusStrip({
  workspaceId,
  conversation,
  refreshKey,
}: {
  workspaceId: string;
  conversation: Conversation;
  refreshKey: string;
}) {
  const [activity, setActivity] = React.useState<AiActivity | null>(null);
  const conversationId = conversation.id;

  React.useEffect(() => {
    let ignore = false;
    fetchAiActivity(workspaceId, conversationId)
      .then((result) => {
        if (!ignore) setActivity(result);
      })
      .catch(() => {
        // The strip is informational; keep whatever was shown.
      });
    return () => {
      ignore = true;
    };
  }, [workspaceId, conversationId, refreshKey]);

  const handoff = handoffLine(conversation.state, conversation.handoffReason);
  const lastAction = activity ? lastAiActionLine(activity) : null;

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs"
      aria-label="AI status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Bot className="size-3.5 text-muted-foreground" />
          <StatusBadge
            label={AI_STATE_HEADLINES[conversation.state]}
            tone={AI_STATE_TONES[conversation.state]}
            className="normal-case"
          />
        </span>
        {lastAction ? <span className="text-muted-foreground">{lastAction}</span> : null}
      </div>
      {handoff ? <p className="font-medium text-foreground text-sm">{handoff}</p> : null}
    </div>
  );
}
