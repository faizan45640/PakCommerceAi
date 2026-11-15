import type { ApiMeta } from "@pakcommerce/shared";
import {
  normalizePhone,
  type Conversation,
  type Message,
  type ParsedConversationSearchQuery,
  type ParsedMessageListQuery,
} from "@pakcommerce/shared";

import { NotFoundError } from "../lib/http-errors.js";
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
