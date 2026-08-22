import { apiErrorSchema } from "@pakcommerce/shared";

import { createClient } from "@/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(message: string, code: string, status: number, details?: Record<string, string[]>) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new ApiRequestError("Not signed in.", "unauthorized", 401);
  }

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export async function apiFetch<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const response = await authedFetch(path, init);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const parsed = apiErrorSchema.safeParse(body);

    if (parsed.success) {
      throw new ApiRequestError(
        parsed.data.error.message,
        parsed.data.error.code,
        response.status,
        parsed.data.error.details,
      );
    }

    throw new ApiRequestError(`Request failed with status ${response.status}.`, "internal_error", response.status);
  }

  return response.json() as Promise<TResponse>;
}
