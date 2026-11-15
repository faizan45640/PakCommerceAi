"use client";

import * as React from "react";

import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Search } from "lucide-react";
import type { Conversation, ConversationState } from "@pakcommerce/shared/conversations";
import { conversationStateValues } from "@pakcommerce/shared/conversations";

import { StatusBadge } from "@/components/dashboard/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { fetchConversations } from "@/lib/api/conversations";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { cn } from "@/lib/utils";

import {
  CONVERSATION_STATE_LABELS,
  CONVERSATION_STATE_TONES,
  MESSAGE_SENDER_LABELS,
  buyerDisplayName,
  formatPhone,
  relativeTime,
} from "./conversation-display";

const PAGE_SIZE = 25;

export function ConversationInbox({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [states, setStates] = React.useState<ConversationState[]>([]);
  const [unreadOnly, setUnreadOnly] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    let ignore = false;
    fetchCurrentWorkspace()
      .then((workspace) => {
        if (!ignore) setWorkspaceId(workspace.id);
      })
      .catch((err: unknown) => {
        if (ignore) return;
        setErrorMessage(err instanceof Error ? err.message : "Failed to load conversations.");
        setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  React.useEffect(() => {
    if (!workspaceId) return;
    let ignore = false;

    async function load(id: string) {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const data = await fetchConversations({
          workspaceId: id,
          query: debouncedSearch,
          states,
          unreadOnly,
          limit: PAGE_SIZE,
        });
        if (ignore) return;
        setItems(data.items);
        setNextCursor(data.nextCursor ?? null);
      } catch (err: unknown) {
        if (!ignore) setErrorMessage(err instanceof Error ? err.message : "Failed to load conversations.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    void load(workspaceId);
    return () => {
      ignore = true;
    };
  }, [workspaceId, debouncedSearch, states, unreadOnly, reloadKey]);

  async function loadMore() {
    if (!workspaceId || !nextCursor) return;
    setIsLoadingMore(true);
    try {
      const data = await fetchConversations({
        workspaceId,
        query: debouncedSearch,
        states,
        unreadOnly,
        limit: PAGE_SIZE,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...data.items]);
      setNextCursor(data.nextCursor ?? null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load more conversations.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  function select(id: string) {
    router.replace(`${pathname}?c=${encodeURIComponent(id)}`, { scroll: false });
  }

  function toggleState(state: ConversationState, checked: boolean) {
    setStates((current) => (checked ? [...current, state] : current.filter((value) => value !== state)));
  }

  const hasFilters = Boolean(debouncedSearch.trim()) || states.length > 0 || unreadOnly;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <MessageSquare className="size-4 text-muted-foreground" />
          Conversations
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 rounded-[min(var(--radius-md),12px)] pl-8"
            placeholder="Search by name or phone..."
            aria-label="Search conversations"
            value={search}
            maxLength={120}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Status{states.length ? `: ${states.length}` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {conversationStateValues.map((state) => (
                <DropdownMenuCheckboxItem
                  key={state}
                  checked={states.includes(state)}
                  onCheckedChange={(checked) => toggleState(state, checked === true)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {CONVERSATION_STATE_LABELS[state]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={unreadOnly ? "secondary" : "outline"}
            size="sm"
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly((value) => !value)}
          >
            Unread only
          </Button>
          {states.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStates([])}>
              Clear status
            </Button>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="py-6 text-center">
            <p role="alert" className="text-destructive text-sm">
              {errorMessage}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setReloadKey((key) => key + 1)}>
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {hasFilters
              ? "No conversations match these filters."
              : "No conversations yet — messages from WhatsApp buyers appear here."}
          </p>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-border">
              {items.map((conversation) => (
                <li key={conversation.id}>
                  <ConversationRow
                    conversation={conversation}
                    selected={conversation.id === selectedId}
                    onSelect={() => select(conversation.id)}
                  />
                </li>
              ))}
            </ul>
            {nextCursor ? (
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={isLoadingMore}>
                {isLoadingMore ? "Loading..." : "Load more"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: Conversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const name = buyerDisplayName(conversation);
  const phone = formatPhone(conversation.buyerPhone);
  const unread = conversation.unreadCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/50",
        selected && "bg-muted",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{name}</span>
        <span className="shrink-0 text-muted-foreground text-xs">{relativeTime(conversation.lastMessageAt)}</span>
      </div>
      {name !== phone ? <span className="text-muted-foreground text-xs">{phone}</span> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-muted-foreground text-xs">
          {conversation.lastMessagePreview ? (
            <>
              {conversation.lastMessageSender ? (
                <span className="font-medium">{MESSAGE_SENDER_LABELS[conversation.lastMessageSender]}: </span>
              ) : null}
              {conversation.lastMessagePreview}
            </>
          ) : (
            "No messages yet"
          )}
        </span>
        {unread ? (
          <Badge className="h-5 min-w-5 shrink-0 justify-center rounded-full px-1.5 text-[10px]">
            <span className="sr-only">Unread messages: </span>
            {conversation.unreadCount}
          </Badge>
        ) : null}
      </div>
      <StatusBadge
        label={CONVERSATION_STATE_LABELS[conversation.state]}
        tone={CONVERSATION_STATE_TONES[conversation.state]}
        className="w-fit normal-case text-[10px]"
      />
    </button>
  );
}
