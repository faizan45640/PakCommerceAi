import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import type { Request } from "express";

import { createApiSupabaseUserClient } from "../lib/supabase.js";
import { UnauthorizedError } from "../lib/http-errors.js";

/**
 * What a product handler needs: who is asking, and a database client that
 * answers as them.
 *
 * `requireAuth` puts the verified token on the request but deliberately does not
 * build a client - it is generic middleware and knows nothing about Supabase.
 * This turns that token into a request-scoped client, which is what makes
 * `auth.uid()` resolve inside Postgres so the RLS policies do the seller
 * scoping.
 */
export interface SellerContext {
  sellerId: string;
  db: AppSupabaseClient;
}

export function sellerContext(request: Request): SellerContext {
  if (!request.auth) {
    // Only reachable if this router is mounted without requireAuth in front of
    // it. Failing loudly beats running an unscoped query.
    throw new UnauthorizedError();
  }

  return {
    // seller_profiles.id IS profiles.id IS auth.users.id, so the authenticated
    // user id is the seller id with no lookup. This is the one place that
    // changes if that ever stops being true.
    sellerId: request.auth.userId,
    db: createApiSupabaseUserClient(request.auth.accessToken),
  };
}
