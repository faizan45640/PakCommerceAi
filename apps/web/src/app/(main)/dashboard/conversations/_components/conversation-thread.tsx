"use client";

import * as React from "react";

import { AlertCircle, Bot, Mic, Paperclip } from "lucide-react";
import type { Conversation, Message } from "@pakcommerce/shared/conversations";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiRequestError } from "@/lib/api/api-client";
import {
  fetchConversationById,
  fetchMessages,
  markConversationRead,
} from "@/lib/api/conversations";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { cn } from "@/lib/utils";

import {
  CONVERSATION_STATE_LABELS,
  CONVERSATION_STATE_TONES,
  MESSAGE_SENDER_LABELS,
  buyerDisplayName,
  formatPhone,
} from "./conversation-display";
import {
  MESSAGE_STATUS_LABELS,
  bubbleSide,
  groupByDay,
  mediaChip,
  messageTime,
  prependOlder,
  toChronological,
} from "./conversation-thread-model";

const PAGE_SIZE = 50;

/** The live thread for `conversationId`. Mount it with `key={conversationId}` so state resets per thread. */
export function ConversationThread({ conversationId }: { conversationId?: string }) {
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [conversation, setConversation] = React.useState<Conversation | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(Boolean(conversationId));
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!conversationId) return;
    let ignore = false;

    async function load(id: string) {
      setIsLoading(true);
      setErrorMessage(null);
      setNotFound(false);
      try {
        const workspace = await fetchCurrentWorkspace();
        const [loaded, page] = await Promise.all([
          fetchConversationById(workspace.id, id),
          fetchMessages(id, { workspaceId: workspace.id, limit: PAGE_SIZE }),
        ]);
        if (ignore) return;
        setWorkspaceId(workspace.id);
        setConversation(loaded);
        setMessages(toChronological(page.items));
        setOlderCursor(page.nextCursor ?? null);

        if (loaded.unreadCount > 0) {
          try {
            const read = await markConversationRead(workspace.id, id);
            if (!ignore) setConversation(read);
          } catch {
            // Not critical: the badge stays until the next open.
          }
        }
      } catch (err: unknown) {
        if (ignore) return;
        if (err instanceof ApiRequestError && err.status === 404) setNotFound(true);
        else setErrorMessage(err instanceof Error ? err.message : "Failed to load conversation.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load(conversationId);
    return () => {
      ignore = true;
    };
  }, [conversationId, reloadKey]);

  async function loadOlder() {
    if (!conversationId || !workspaceId || !olderCursor) return;
    setIsLoadingOlder(true);
    try {
      const page = await fetchMessages(conversationId, { workspaceId, limit: PAGE_SIZE, cursor: olderCursor });
      setMessages((current) => prependOlder(current, page.items));
      setOlderCursor(page.nextCursor ?? null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load older messages.");
    } finally {
      setIsLoadingOlder(false);
    }
  }

  if (!conversationId) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground text-sm">
          Select a conversation to read the thread.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 py-6" aria-busy="true">
          <div className="h-6 w-48 animate-pulse rounded bg-muted" />
          <div className="h-48 animate-pulse rounded-lg bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  if (notFound || errorMessage || !conversation) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="size-8 text-destructive" />
          <h2 className="font-semibold text-base">
            {notFound ? "Conversation not found" : "Could not load conversation"}
          </h2>
          <p className="max-w-md text-muted-foreground text-sm">
            {notFound
              ? "It may have been removed, or it belongs to another workspace."
              : (errorMessage ?? "Something went wrong.")}
          </p>
          {notFound ? null : (
            <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const name = buyerDisplayName(conversation);
  const phone = formatPhone(conversation.buyerPhone);
  const days = groupByDay(messages);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{name}</span>
            {name !== phone ? <span className="font-normal text-muted-foreground text-xs">{phone}</span> : null}
          </span>
          <StatusBadge
            label={CONVERSATION_STATE_LABELS[conversation.state]}
            tone={CONVERSATION_STATE_TONES[conversation.state]}
            className="normal-case"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-2">
          {olderCursor ? (
            <Button
              variant="outline"
              size="sm"
              className="self-center"
              onClick={() => void loadOlder()}
              disabled={isLoadingOlder}
            >
              {isLoadingOlder ? "Loading..." : "Load older messages"}
            </Button>
          ) : null}
          {messages.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground text-sm">No messages in this conversation yet.</p>
          ) : (
            days.map((day) => (
              <section key={day.key} className="flex flex-col gap-3">
                <div className="self-center rounded-full bg-muted px-3 py-0.5 text-[10px] text-muted-foreground">
                  {day.label}
                </div>
                {day.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
              </section>
            ))
          )}
        </div>

        {conversation.state === "human_takeover" ? null : (
          <p className="rounded-md border border-dashed px-3 py-2 text-muted-foreground text-xs">
            Replying from here needs you to take over this conversation. Sending is not available yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const side = bubbleSide(message.sender);

  if (side === "center") {
    return (
      <div className="self-center text-center text-muted-foreground text-xs italic">
        {message.body}
        <span className="ml-2 not-italic text-[10px]">{messageTime(message.createdAt)}</span>
      </div>
    );
  }

  const isAi = message.sender === "ai";
  const outbound = message.direction === "outbound";

  return (
    <div className={cn("flex max-w-[80%] flex-col gap-0.5", side === "left" ? "items-start" : "items-end self-end")}>
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {isAi ? <Bot className="size-3" /> : null}
        {MESSAGE_SENDER_LABELS[message.sender]}
      </span>
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-lg px-3 py-2 text-sm",
          side === "left" && "bg-muted",
          isAi && "border border-primary/30 bg-primary/10",
          message.sender === "seller" && "bg-primary text-primary-foreground",
        )}
      >
        {message.media.map((media, index) => {
          const chip = mediaChip(media);
          const content = (
            <>
              {chip.label === "Voice note" ? <Mic className="size-3" /> : <Paperclip className="size-3" />}
              {chip.label}
            </>
          );
          const className = "inline-flex w-fit items-center gap-1 rounded-full border border-current/30 px-2 py-0.5 text-xs";
          return chip.href ? (
            <a key={index} href={chip.href} target="_blank" rel="noreferrer noopener" className={className}>
              {content}
            </a>
          ) : (
            <span key={index} className={className}>
              {content}
            </span>
          );
        })}
        {message.body ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
      </div>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {messageTime(message.createdAt)}
        {outbound ? (
          <span className={message.status === "failed" ? "text-destructive" : undefined}>
            · {MESSAGE_STATUS_LABELS[message.status]}
          </span>
        ) : null}
      </span>
    </div>
  );
}
