import { createHash, timingSafeEqual } from "node:crypto";

import { aiMayReply } from "@pakcommerce/shared/conversations";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import { createApiSupabaseAdminClient } from "../lib/supabase.js";
import { databaseToolAudit } from "../tools/audit.js";
import "../tools/definitions.js";
import {
  describeTool,
  runTool,
  toolRegistry,
  type ToolAuditSink,
  type ToolContext,
  type ToolRegistry,
} from "../tools/registry.js";

/**
 * Service-to-service surface for the WhatsApp sales agent (apps/ml).
 *
 * Not seller auth: the caller is our own Python service, identified by a shared
 * secret. With `AGENT_SERVICE_TOKEN` unset the whole surface answers 404, as if
 * it did not exist.
 *
 * The agent never says which shop it is acting for. The workspace (and seller)
 * are read from the conversation row, so a caller cannot point a tool at
 * another tenant's data by sending a different id.
 *
 * Every error is `{ ok: false, error: { code, message } }`.
 */

export interface AgentRouterOptions {
  audit?: ToolAuditSink;
  /** Defaults to the process-wide registry. Tests pass their own. */
  registry?: ToolRegistry;
}

function fail(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ ok: false, error: { code, message } });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function requireAgentToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.AGENT_SERVICE_TOKEN?.trim();
  if (!expected) {
    fail(res, 404, "not_found", "Unknown API endpoint.");
    return;
  }

  const header = req.header("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  // Hash both sides so the compare is constant-time whatever the lengths.
  if (!match || !timingSafeEqual(digest(match[1]!), digest(expected))) {
    fail(res, 401, "unauthorized", "Invalid agent token.");
    return;
  }
  next();
}

const callBodySchema = z.object({
  conversationId: z.uuid(),
  input: z.unknown().optional(),
});

export function createAgentRouter(options: AgentRouterOptions = {}): Router {
  const audit = options.audit ?? databaseToolAudit;
  const registry = options.registry ?? toolRegistry;
  const router = Router();

  router.use(requireAgentToken);

  router.get("/tools", (_req, res) => {
    res.json({ data: registry.list({ audience: "sales_agent" }).map(describeTool) });
  });

  router.post("/tools/:name", async (req, res, next) => {
    try {
      const def = registry.get(String(req.params.name));
      // A copilot-only tool is indistinguishable from one that does not exist.
      if (!def || !def.audiences.includes("sales_agent")) {
        fail(res, 404, "unknown_tool", "No such tool.");
        return;
      }

      const body = callBodySchema.safeParse(req.body);
      if (!body.success) {
        fail(res, 400, "invalid_request", "Body must be { conversationId (uuid), input }.");
        return;
      }

      const db = createApiSupabaseAdminClient();
      const { data: conversation, error } = await db
        .from("conversations")
        .select("id, workspace_id, seller_id, state")
        .eq("id", body.data.conversationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!conversation) {
        fail(res, 404, "conversation_not_found", "No such conversation.");
        return;
      }

      if (def.needsApproval) {
        fail(res, 403, "approval_required", "This tool needs seller approval and is not available.");
        return;
      }
      if (def.permission === "write" && !aiMayReply(conversation.state)) {
        fail(res, 403, "ai_not_allowed", "The AI does not hold this conversation.");
        return;
      }

      const ctx: ToolContext = {
        db,
        workspaceId: conversation.workspace_id,
        sellerId: conversation.seller_id,
        actor: "ai",
        audience: "sales_agent",
        conversationId: conversation.id,
        audit,
      };

      const result = await runTool(def, ctx, body.data.input ?? {});
      if (result.ok) {
        res.json({ ok: true, output: result.output });
        return;
      }
      if (result.status === 500) console.error(`Agent tool ${def.name} failed:`, result.cause);
      fail(res, result.status, result.error.code, result.error.message);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
