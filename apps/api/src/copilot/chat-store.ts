import type { UIMessage } from "ai";
import type { Database } from "@pakcommerce/integrations/supabase";

import { NotFoundError } from "../lib/http-errors.js";
import type { SellerContext } from "../middleware/seller-context.js";
import { generateChatTitle } from "./chat-title.js";

type ChatMessageColumn = Database["public"]["Tables"]["copilot_chats"]["Insert"]["messages"];

export interface CopilotChatSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  archivedAt: string | null;
}

const LIST_LIMIT = 50;

/**
 * A new user message is appended. An approval updates the assistant message
 * that is already stored, matched by id, instead of adding a second copy.
 */
export function applyIncomingMessage(previous: UIMessage[], incoming: UIMessage): UIMessage[] {
  const index = previous.findIndex((message) => message.id === incoming.id);
  if (index === -1) return [...previous, incoming];
  return [...previous.slice(0, index), incoming];
}

function asMessages(value: unknown): UIMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((message): message is UIMessage => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as Partial<UIMessage>;
    return typeof candidate.id === "string" && Array.isArray(candidate.parts);
  });
}

function toSummary(row: {
  id: string;
  title: string | null;
  updated_at: string;
  archived_at: string | null;
}): CopilotChatSummary {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

async function defaultWorkspaceId(auth: SellerContext): Promise<string> {
  const { data, error } = await auth.db
    .from("workspaces")
    .select("id")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("No shop workspace yet.");
  return data.id;
}

export async function listChats(
  auth: SellerContext,
  options: { archived?: boolean } = {},
): Promise<CopilotChatSummary[]> {
  let query = auth.db
    .from("copilot_chats")
    .select("id, title, updated_at, archived_at")
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);

  query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map(toSummary);
}

export async function createChat(auth: SellerContext): Promise<CopilotChatSummary> {
  const workspaceId = await defaultWorkspaceId(auth);
  const { data, error } = await auth.db
    .from("copilot_chats")
    .insert({
      workspace_id: workspaceId,
      seller_id: auth.sellerId,
      messages: [],
    })
    .select("id, title, updated_at, archived_at")
    .single();

  if (error) throw new Error(error.message);

  return toSummary(data);
}

export async function loadChat(auth: SellerContext, id: string): Promise<UIMessage[]> {
  const { data, error } = await auth.db
    .from("copilot_chats")
    .select("messages")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Chat not found.");
  return asMessages(data.messages);
}

/**
 * Replaces the stored UIMessage array. On the first save that has a user
 * message, asks the model for a short sidebar title and stores that once.
 */
export async function saveChat(auth: SellerContext, id: string, messages: UIMessage[]): Promise<void> {
  const { data, error } = await auth.db
    .from("copilot_chats")
    .update({
      messages: messages as unknown as ChatMessageColumn,
    })
    .eq("id", id)
    .select("id, title")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Chat not found.");

  if (data.title) return;

  const title = await generateChatTitle(messages);
  if (!title) return;

  const { error: titleError } = await auth.db
    .from("copilot_chats")
    .update({ title })
    .eq("id", id)
    .is("title", null);

  if (titleError) throw new Error(titleError.message);
}

export async function archiveChat(auth: SellerContext, id: string): Promise<CopilotChatSummary> {
  const { data, error } = await auth.db
    .from("copilot_chats")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, title, updated_at, archived_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Chat not found.");
  return toSummary(data);
}

export async function unarchiveChat(auth: SellerContext, id: string): Promise<CopilotChatSummary> {
  const { data, error } = await auth.db
    .from("copilot_chats")
    .update({ archived_at: null })
    .eq("id", id)
    .select("id, title, updated_at, archived_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Chat not found.");
  return toSummary(data);
}

export async function deleteChat(auth: SellerContext, id: string): Promise<void> {
  const { data, error } = await auth.db
    .from("copilot_chats")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Chat not found.");
}
