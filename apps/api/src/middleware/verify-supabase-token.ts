import { createApiSupabaseClient } from "../lib/supabase.js";
import type { TokenVerifier } from "./auth.js";

export const supabaseTokenVerifier: TokenVerifier = async (accessToken) => {
  const supabase = createApiSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("Token verification failed.");
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
};
