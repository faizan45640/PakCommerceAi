"use client";

import * as React from "react";

import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, FlaskConical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ApiRequestError } from "@/lib/api/api-client";
import { fetchConversationById, fetchMessages, sendMockInbound } from "@/lib/api/conversations";
import { fetchCurrentWorkspace } from "@/lib/api/products";

import {
  SIMULATOR_DEFAULT_NAME,
  SIMULATOR_DEFAULT_PHONE,
  SIMULATOR_POLL_INTERVAL_MS,
  aiReplyArrived,
  buildMockInboundPayload,
  shouldStopPolling,
  stateHint,
  validateSimulatorForm,
} from "./buyer-simulator-model";

const fieldClass =
  "w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Dev/demo tool: posts a fake buyer message through the mock inbound endpoint,
 * selects the conversation, and polls so the AI reply shows up on its own.
 * Hidden when the API reports mock inbound as disabled (404).
 */
export function BuyerSimulator({
  onActivity,
  buyer,
}: {
  onActivity: () => void;
  /** Inline mode under a thread: reply as this conversation's buyer, no phone/name fields. */
  buyer?: { phone: string; name: string | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [phone, setPhone] = React.useState(buyer?.phone ?? SIMULATOR_DEFAULT_PHONE);
  const [name, setName] = React.useState(buyer ? (buyer.name ?? "") : SIMULATOR_DEFAULT_NAME);
  const [message, setMessage] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isWaiting, setIsWaiting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [disabled, setDisabled] = React.useState(false);
  const [disabledReason, setDisabledReason] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const pollTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const runId = React.useRef(0);
  const onActivityRef = React.useRef(onActivity);
  React.useEffect(() => {
    onActivityRef.current = onActivity;
  });

  React.useEffect(
    () => () => {
      runId.current += 1;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  function poll(workspaceId: string, conversationId: string, inboundMessageId: string, startedAt: number, run: number) {
    pollTimer.current = setTimeout(async () => {
      if (run !== runId.current) return;
      try {
        const [conversation, page] = await Promise.all([
          fetchConversationById(workspaceId, conversationId),
          fetchMessages(conversationId, { workspaceId, limit: 10 }),
        ]);
        if (run !== runId.current) return;
        onActivityRef.current();
        const done = shouldStopPolling({
          aiReplied: aiReplyArrived(page.items, inboundMessageId),
          state: conversation.state,
          elapsedMs: Date.now() - startedAt,
        });
        if (done) {
          setIsWaiting(false);
          // The AI reply and the handoff update land back to back; refresh once more so state is not stale.
          pollTimer.current = setTimeout(() => {
            if (run === runId.current) onActivityRef.current();
          }, SIMULATOR_POLL_INTERVAL_MS);
          return;
        }
      } catch {
        if (shouldStopPolling({ aiReplied: false, state: "ai_active", elapsedMs: Date.now() - startedAt })) {
          setIsWaiting(false);
          return;
        }
      }
      poll(workspaceId, conversationId, inboundMessageId, startedAt, run);
    }, SIMULATOR_POLL_INTERVAL_MS);
  }

  async function send() {
    if (isSending) return;
    const problem = validateSimulatorForm({ phone, name, message });
    if (problem) {
      setError(problem);
      return;
    }
    setIsSending(true);
    setError(null);
    setNotice(null);
    runId.current += 1;
    const run = runId.current;
    if (pollTimer.current) clearTimeout(pollTimer.current);
    setIsWaiting(false);
    try {
      const workspace = await fetchCurrentWorkspace();
      const result = await sendMockInbound(buildMockInboundPayload(workspace.id, { phone, name, message }));
      setMessage("");
      router.replace(`${pathname}?c=${encodeURIComponent(result.conversationId)}`, { scroll: false });
      onActivityRef.current();
      const hint = stateHint(result.state);
      if (hint) {
        setNotice(hint);
      } else {
        setIsWaiting(true);
        poll(workspace.id, result.conversationId, result.messageId, Date.now(), run);
      }
    } catch (err: unknown) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setDisabled(true);
        return;
      }
      if (err instanceof ApiRequestError && err.status === 409) {
        setDisabled(true);
        setDisabledReason(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not send the test message.");
    } finally {
      setIsSending(false);
    }
  }

  if (disabled) {
    return disabledReason ? (
      <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
        Test as a buyer is unavailable: {disabledReason}
      </p>
    ) : null;
  }

  const status = error ? (
    <p role="alert" className="text-destructive text-xs">
      {error}
    </p>
  ) : notice ? (
    <p className="text-muted-foreground text-xs">{notice}</p>
  ) : isWaiting ? (
    <p className="text-muted-foreground text-xs">Waiting for the AI to reply...</p>
  ) : (
    <span />
  );

  if (buyer) {
    return (
      <form
        className="flex flex-col gap-2 rounded-md border border-dashed p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <FlaskConical className="size-3.5" aria-hidden />
          Reply as the buyer (simulator, not a real WhatsApp message)
        </span>
        <textarea
          className={`${fieldClass} resize-none`}
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          maxLength={4096}
          placeholder="Type as the buyer... (Enter to send)"
          aria-label="Message as the buyer"
        />
        <div className="flex items-center justify-between gap-2">
          {status}
          <Button type="submit" size="sm" variant="outline" disabled={isSending || message.trim() === ""}>
            {isSending ? "Sending..." : "Send as buyer"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <Card className="border-dashed">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between gap-2 text-left">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FlaskConical className="size-4 text-muted-foreground" />
                Test as a buyer
              </CardTitle>
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <p className="rounded-md bg-muted px-3 py-1.5 text-muted-foreground text-xs">
                Simulator — not a real WhatsApp message. It goes through the same path as a buyer message.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  Buyer phone
                  <input
                    className={fieldClass}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={32}
                    inputMode="tel"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Buyer name
                  <input
                    className={fieldClass}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={200}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-xs">
                Message
                <textarea
                  className={`${fieldClass} resize-none`}
                  rows={2}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={4096}
                  placeholder="Salam, do you have this in stock?"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                {status}
                <Button type="submit" size="sm" disabled={isSending}>
                  {isSending ? "Sending..." : "Send as buyer"}
                </Button>
              </div>
            </form>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
