import type { AiActivity, Conversation, ConversationState, Message } from "@pakcommerce/shared/conversations";
import type { ApiDataResponse, ApiListResponse } from "@pakcommerce/shared/api";

import { apiFetch } from "./api-client";

export interface ConversationListParams {
  workspaceId: string;
  /** Matches buyer name or phone. */
  query?: string;
  states?: ConversationState[];
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ConversationListResult {
  items: Conversation[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
  nextCursor?: string | null;
}

/** Builds the `GET /conversations` query string; blank values are left out. */
export function buildConversationListSearchParams(params: ConversationListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set("workspaceId", params.workspaceId);

  if (params.query?.trim()) searchParams.set("query", params.query.trim());
  if (params.states?.length) searchParams.set("states", params.states.join(","));
  if (params.unreadOnly) searchParams.set("unreadOnly", "true");
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);

  return searchParams;
}

export async function fetchConversations(params: ConversationListParams): Promise<ConversationListResult> {
  const response = await apiFetch<ApiListResponse<Conversation> & { nextCursor?: string | null }>(
    `/api/v1/conversations?${buildConversationListSearchParams(params).toString()}`,
  );

  return {
    items: response.data,
    meta: response.meta,
    nextCursor: response.nextCursor,
  };
}

export interface MessageListParams {
  workspaceId: string;
  limit?: number;
  cursor?: string;
}

export interface MessageListResult {
  /** Newest first, as the API returns them. */
  items: Message[];
  nextCursor?: string | null;
}

export async function fetchConversationById(workspaceId: string, id: string): Promise<Conversation> {
  const response = await apiFetch<ApiDataResponse<Conversation>>(
    `/api/v1/conversations/${encodeURIComponent(id)}?${new URLSearchParams({ workspaceId }).toString()}`,
  );
  return response.data;
}

/** One page of a thread, newest first. `cursor` loads the page of older messages. */
export async function fetchMessages(id: string, params: MessageListParams): Promise<MessageListResult> {
  const searchParams = new URLSearchParams({ workspaceId: params.workspaceId });
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.cursor) searchParams.set("cursor", params.cursor);

  const response = await apiFetch<ApiListResponse<Message> & { nextCursor?: string | null }>(
    `/api/v1/conversations/${encodeURIComponent(id)}/messages?${searchParams.toString()}`,
  );
  return { items: response.data, nextCursor: response.nextCursor };
}

/** Moves a conversation to `to` as the seller. `reason` is kept only for `human_takeover`. */
export async function changeConversationState(
  workspaceId: string,
  id: string,
  to: ConversationState,
  reason?: string,
): Promise<Conversation> {
  const response = await apiFetch<ApiDataResponse<Conversation>>(
    `/api/v1/conversations/${encodeURIComponent(id)}/state`,
    {
      method: "POST",
      body: JSON.stringify({ workspaceId, to, ...(reason?.trim() ? { reason: reason.trim() } : {}) }),
    },
  );
  return response.data;
}

/** Sends a seller reply over WhatsApp. Only allowed while the conversation is in human takeover. */
export async function sendConversationMessage(workspaceId: string, id: string, body: string): Promise<Message> {
  const response = await apiFetch<ApiDataResponse<Message>>(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ workspaceId, body }),
  });
  return response.data;
}

/** What the AI did in this conversation: state, handoff reason, last reply and recent tool calls. */
export async function fetchAiActivity(workspaceId: string, id: string): Promise<AiActivity> {
  const response = await apiFetch<ApiDataResponse<AiActivity>>(
    `/api/v1/conversations/${encodeURIComponent(id)}/ai-activity?${new URLSearchParams({ workspaceId }).toString()}`,
  );
  return response.data;
}

export interface MockInboundResult {
  conversationId: string;
  messageId: string;
  duplicate: boolean;
  state: ConversationState;
}

/** Dev/demo: posts a fake buyer message. Rejects with a 404 `ApiRequestError` when mock inbound is disabled. */
export async function sendMockInbound(payload: {
  workspaceId: string;
  From: string;
  ProfileName?: string;
  Body: string;
}): Promise<MockInboundResult> {
  const response = await apiFetch<ApiDataResponse<MockInboundResult>>("/api/v1/conversations/mock-inbound", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return response.data;
}

/** Marks every message in the thread as seen; returns the conversation with `unreadCount` 0. */
export async function markConversationRead(workspaceId: string, id: string): Promise<Conversation> {
  const response = await apiFetch<ApiDataResponse<Conversation>>(
    `/api/v1/conversations/${encodeURIComponent(id)}/read?${new URLSearchParams({ workspaceId }).toString()}`,
    { method: "POST" },
  );
  return response.data;
}
