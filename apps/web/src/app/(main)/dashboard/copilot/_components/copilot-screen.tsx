"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Plus,
  SquarePen,
  Trash2,
} from "lucide-react";

import { ApiRequestError, apiFetch } from "@/lib/api/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";
import { cn } from "@/lib/utils";

import { NaturalLanguageQuery } from "./natural-language-query";
import { RafiqEmpty } from "./rafiq-empty";

const HISTORY_OPEN_KEY = "rafiq.historyOpen";

interface ChatSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  archivedAt: string | null;
}

interface ChatRecord {
  id: string;
  messages: UIMessage[];
}

export function CopilotScreen() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [archivedChats, setArchivedChats] = useState<ChatSummary[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [session, setSession] = useState<{ id: string; messages: UIMessage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(() => getLocalStorageValue(HISTORY_OPEN_KEY) !== "0");
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const openingRef = useRef<string | null>(null);
  const request = useRef(0);

  const takeOpening = useCallback(() => {
    const text = openingRef.current;
    openingRef.current = null;
    return text;
  }, []);

  const refreshChats = useCallback(async () => {
    const [active, archived] = await Promise.all([
      apiFetch<{ data: ChatSummary[] }>("/api/v1/copilot/chats"),
      apiFetch<{ data: ChatSummary[] }>("/api/v1/copilot/chats?archived=1"),
    ]);
    setChats(active.data);
    setArchivedChats(archived.data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        await refreshChats();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof ApiRequestError ? cause.message : "Rafiq could not open your chats.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshChats]);

  function toggleHistory() {
    setHistoryOpen((open) => {
      const next = !open;
      setLocalStorageValue(HISTORY_OPEN_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function openChat(id: string) {
    if (session?.id === id) return;
    const token = ++request.current;
    setError(null);
    try {
      const chat = await apiFetch<{ data: ChatRecord }>(`/api/v1/copilot/chats/${id}`);
      if (token !== request.current) return;
      openingRef.current = null;
      setDraft("");
      setSession({ id: chat.data.id, messages: chat.data.messages });
    } catch (cause) {
      if (token !== request.current) return;
      setError(cause instanceof ApiRequestError ? cause.message : "Rafiq could not open that chat.");
    }
  }

  async function startChat(prompt?: string) {
    const text = prompt?.trim();
    if (text === "") return;

    const token = ++request.current;
    setError(null);
    setStarting(true);
    try {
      const body = await apiFetch<{ data: ChatSummary }>("/api/v1/copilot/chats", { method: "POST" });
      if (token !== request.current) return;
      openingRef.current = text ?? null;
      setDraft("");
      setChats((current) => [body.data, ...current.filter((chat) => chat.id !== body.data.id)]);
      setSession({ id: body.data.id, messages: [] });
    } catch (cause) {
      if (token !== request.current) return;
      setError(cause instanceof ApiRequestError ? cause.message : "Rafiq could not start a chat.");
    } finally {
      if (token === request.current) setStarting(false);
    }
  }

  function showGreeting() {
    request.current += 1;
    openingRef.current = null;
    setDraft("");
    setSession(null);
    setError(null);
  }

  async function archiveChat(id: string) {
    setError(null);
    try {
      await apiFetch<{ data: ChatSummary }>(`/api/v1/copilot/chats/${id}/archive`, { method: "POST" });
      if (session?.id === id) showGreeting();
      await refreshChats();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : "Could not archive that chat.");
    }
  }

  async function unarchiveChat(id: string) {
    setError(null);
    try {
      await apiFetch<{ data: ChatSummary }>(`/api/v1/copilot/chats/${id}/unarchive`, { method: "POST" });
      await refreshChats();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : "Could not restore that chat.");
    }
  }

  async function confirmDeleteChat() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setError(null);
    setDeleting(true);
    try {
      await apiFetch<void>(`/api/v1/copilot/chats/${id}`, { method: "DELETE" });
      setPendingDelete(null);
      if (session?.id === id) showGreeting();
      await refreshChats();
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : "Could not delete that chat.");
    } finally {
      setDeleting(false);
    }
  }

  function renderChatRow(chat: ChatSummary, archived: boolean) {
    return (
      <li key={chat.id} className="group relative">
        <button
          type="button"
          onClick={() => void openChat(chat.id)}
          className={cn(
            "block w-full truncate rounded-lg py-2 pl-2.5 pr-9 text-left text-sm transition-colors",
            session?.id === chat.id
              ? "bg-background font-medium text-foreground shadow-sm ring-1 ring-border/70"
              : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
          )}
          title={chat.title ?? "New chat"}
        >
          <span className="block truncate">{chat.title ?? "New chat"}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "absolute right-1 top-1/2 size-7 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                session?.id === chat.id && "opacity-100",
              )}
              aria-label="Chat options"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {archived ? (
              <DropdownMenuItem onClick={() => void unarchiveChat(chat.id)}>
                <ArchiveRestore className="size-3.5" />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => void archiveChat(chat.id)}>
                <Archive className="size-3.5" />
                Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(chat)}>
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-border/70 bg-background">
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r border-border/60 bg-muted/20 transition-[width] duration-200 ease-out",
            historyOpen ? "w-64" : "w-14",
          )}
        >
          <div className={cn("flex items-center gap-1 p-2", historyOpen ? "justify-between" : "flex-col")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground"
                  onClick={toggleHistory}
                  aria-label={historyOpen ? "Hide chat history" : "Show chat history"}
                >
                  {historyOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{historyOpen ? "Hide history" : "Show history"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={historyOpen ? "secondary" : "ghost"}
                  size={historyOpen ? "sm" : "icon"}
                  className={cn(historyOpen ? "h-9 flex-1 gap-1.5" : "size-9 text-muted-foreground")}
                  onClick={showGreeting}
                  disabled={loading || starting}
                >
                  {historyOpen ? (
                    <>
                      <SquarePen className="size-3.5" />
                      New chat
                    </>
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              {!historyOpen ? <TooltipContent side="right">New chat</TooltipContent> : null}
            </Tooltip>
          </div>

          {historyOpen ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="scrollbar-hover min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <p className="px-2.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  Recent
                </p>
                {chats.length === 0 && !loading ? (
                  <p className="px-2.5 text-xs text-muted-foreground">No chats yet.</p>
                ) : (
                  <ul className="space-y-0.5">{chats.map((chat) => renderChatRow(chat, false))}</ul>
                )}

                {showArchived && archivedChats.length > 0 ? (
                  <>
                    <p className="mt-4 px-2.5 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
                      Archived
                    </p>
                    <ul className="space-y-0.5">{archivedChats.map((chat) => renderChatRow(chat, true))}</ul>
                  </>
                ) : null}
              </div>

              {archivedChats.length > 0 ? (
                <div className="border-t border-border/50 p-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-start gap-2 px-2.5 text-xs text-muted-foreground"
                    onClick={() => setShowArchived((open) => !open)}
                  >
                    <Archive className="size-3.5" />
                    {showArchived ? "Hide archived" : `Archived (${archivedChats.length})`}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </aside>

        <Dialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open && !deleting) setPendingDelete(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete this chat?</DialogTitle>
              <DialogDescription>
                {pendingDelete?.title
                  ? `“${pendingDelete.title}” will be removed for good.`
                  : "This chat will be removed for good."}{" "}
                You can’t undo this.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
              >
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void confirmDeleteChat()}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="relative flex min-w-0 flex-1 flex-col">
          {error ? (
            <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="m-auto flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <div className="size-8 animate-pulse rounded-full bg-muted" />
              Opening Rafiq…
            </div>
          ) : session ? (
            <NaturalLanguageQuery
              key={session.id}
              chatId={session.id}
              initialMessages={session.messages}
              takeOpening={takeOpening}
              onFinished={() => {
                void refreshChats().catch(() => {
                  // Transcript is already saved; the list can catch up next time.
                });
              }}
            />
          ) : (
            <RafiqEmpty
              input={draft}
              onInputChange={setDraft}
              busy={starting}
              onSubmit={() => void startChat(draft)}
              onSuggestion={(prompt) => void startChat(prompt)}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
