import type { ApiMeta } from "@pakcommerce/shared";
import {
  normalizePhone,
  type Conversation,
  type Message,
  type ParsedConversationSearchQuery,
  type ParsedMessageListQuery,
} from "@pakcommerce/shared";

import {
  assertConversationTransition,
  conversationStateSchema,
  type ConversationState,
} from "@pakcommerce/shared/conversations";
import { z } from "zod";

import { ConflictError, NotFoundError } from "../lib/http-errors.js";
import { decodePageCursor, encodePageCursor } from "../lib/page-cursor.js";
import { escapePostgrestFilterValue } from "../lib/postgrest.js";
import type { SellerContext } from "../middleware/seller-context.js";
import {
  toConversation,
  toMessage,
  type ConversationRow,
  type MessageRow,
} from "./conversation-mapper.js";

/**
 * WhatsApp inbox reads. Every query goes through `auth.db` (the seller's
 * token), so RLS scopes rows inside Postgres; there is no `where seller_id`.
 * Conversations are created by `ingest_inbound_message`, never here.
 */

interface Page<T> {
  items: T[];
  meta: ApiMeta;
  nextCursor: string | null;
}

export async function listConversations(
  auth: SellerContext,
  query: ParsedConversationSearchQuery,
): Promise<Page<Conversation>> {
  const page = decodePageCursor(query.cursor);
  const offset = (page - 1) * query.limit;

  let builder = auth.db
    .from("conversations")
    .select("*", { count: "exact" })
    .eq("workspace_id", query.workspaceId);

  if (query.states?.length) builder = builder.in("state", query.states);
  if (query.unreadOnly) builder = builder.gt("unread_count", 0);

  if (query.query) {
    const filter = searchFilter(query.query);
    // Nothing left to search for (for example just "*"): match nothing.
    if (filter === null) {
      return { items: [], meta: { page, pageSize: query.limit, total: 0 }, nextCursor: null };
    }
    builder = builder.or(filter);
  }

  const { data, count, error } = await builder
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(offset, offset + query.limit - 1);

  if (error) throw new Error(error.message, { cause: error });

  const rows = (data ?? []) as ConversationRow[];
  const total = count ?? 0;

  return {
    items: rows.map(toConversation),
    meta: { page, pageSize: query.limit, total },
    nextCursor: offset + rows.length < total ? encodePageCursor(page + 1) : null,
  };
}

export async function getConversation(
  auth: SellerContext,
  workspaceId: string,
  conversationId: string,
): Promise<Conversation> {
  const { data, error } = await auth.db
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message, { cause: error });
  if (!data) throw new NotFoundError("Conversation not found.");

  return toConversation(data as ConversationRow);
}

/** One page of a thread, newest first. */
export async function listMessages(
  auth: SellerContext,
  conversationId: string,
  query: ParsedMessageListQuery,
): Promise<Page<Message>> {
  // 404 for an unknown or foreign thread instead of an empty page.
  await getConversation(auth, query.workspaceId, conversationId);

  const page = decodePageCursor(query.cursor);
  const offset = (page - 1) * query.limit;

  const { data, count, error } = await auth.db
    .from("messages")
    .select("*", { count: "exact" })
    .eq("conversation_id", conversationId)
    .eq("workspace_id", query.workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + query.limit - 1);

  if (error) throw new Error(error.message, { cause: error });

  const rows = (data ?? []) as MessageRow[];
  const total = count ?? 0;

  return {
    items: rows.map(toMessage),
    meta: { page, pageSize: query.limit, total },
    nextCursor: offset + rows.length < total ? encodePageCursor(page + 1) : null,
  };
}

export async function markConversationRead(
  auth: SellerContext,
  workspaceId: string,
  conversationId: string,
): Promise<Conversation> {
  const { data, error } = await auth.db
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("workspace_id", workspaceId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message, { cause: error });
  if (!data) throw new NotFoundError("Conversation not found.");

  return toConversation(data as ConversationRow);
}

export const transitionConversationInputSchema = z.object({
  workspaceId: z.uuid(),
  to: conversationStateSchema,
  /** Why the seller took over. Stored only when `to` is `human_takeover`. */
  reason: z.string().trim().max(500).optional(),
});

export type TransitionConversationInput = z.output<typeof transitionConversationInputSchema>;

/**
 * Moves a conversation between states as the seller (take over, hand back to
 * the AI, turn AI off, close).
 *
 * The actor is always `seller` here, so the shared actor rules apply. The update
 * is conditional on the state we just read: if another tab changed it first, no
 * row matches and the caller gets a 409 instead of skipping the guard. The
 * database trigger remains the backstop for the edge list.
 */
export async function transitionConversationState(
  auth: SellerContext,
  conversationId: string,
  input: TransitionConversationInput,
): Promise<Conversation> {
  const current = await getConversation(auth, input.workspaceId, conversationId);
  const from: ConversationState = current.state;

  try {
    assertConversationTransition(from, input.to, "seller");
  } catch {
    throw new ConflictError(`A conversation cannot move from ${from} to ${input.to}.`, {
      to: [`Not allowed from ${from}.`],
    });
  }

  const { data, error } = await auth.db
    .from("conversations")
    .update({
      state: input.to,
      handoff_reason: input.to === "human_takeover" ? (input.reason ?? null) : null,
    })
    .eq("id", conversationId)
    .eq("workspace_id", input.workspaceId)
    .eq("state", from)
    .select("*")
    .maybeSingle();

  if (error) {
    // 23514: the trigger refused the edge. Treat like an illegal move.
    if (error.code === "23514") {
      throw new ConflictError(`A conversation cannot move from ${from} to ${input.to}.`);
    }
    throw new Error(error.message, { cause: error });
  }

  // The row exists (we just read it), so no match means someone else moved it first.
  if (!data) {
    throw new ConflictError("This conversation was just updated elsewhere. Reload and try again.");
  }

  return toConversation(data as ConversationRow);
}

/** Resolves when `workspaceId` belongs to the caller; otherwise 404 (RLS hides foreign rows). */
export async function assertWorkspaceOwned(
  auth: SellerContext,
  workspaceId: string,
): Promise<void> {
  const { data, error } = await auth.db
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message, { cause: error });
  if (!data) throw new NotFoundError("Workspace not found.");
}

/**
 * The `.or()` predicate for a buyer search, or null when there is nothing to
 * search for. Matches name and phone; a typed phone in any format also matches
 * through its normalised form. `*` is dropped (PostgREST wildcard, no escape).
 */
export function searchFilter(rawTerm: string): string | null {
  const term = rawTerm.replace(/\*/g, "").trim();
  if (!term) return null;

  const phonePatterns = new Set<string>([term]);

  const normalized = normalizePhone(term);
  if (normalized) phonePatterns.add(normalized);

  if (/^[0-9 ()+.-]+$/.test(term)) {
    const digits = term.replace(/[^0-9]/g, "");
    if (digits.startsWith("0") && digits.length > 1) phonePatterns.add(`+92${digits.slice(1)}`);
  }

  return [
    `buyer_name.ilike.${likeValue(term)}`,
    ...[...phonePatterns].map((pattern) => `buyer_phone.ilike.${likeValue(pattern)}`),
  ].join(",");
}

/** A quoted `%value%` for a PostgREST `ilike` filter, with LIKE wildcards made literal. */
function likeValue(value: string): string {
  const literal = value.replace(/[\\%_]/g, "\\$&");
  return `"%${escapePostgrestFilterValue(literal)}%"`;
}
