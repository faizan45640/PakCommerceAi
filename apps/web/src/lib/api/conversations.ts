import type { Conversation, ConversationState } from "@pakcommerce/shared/conversations";
import type { ApiListResponse } from "@pakcommerce/shared/api";

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
