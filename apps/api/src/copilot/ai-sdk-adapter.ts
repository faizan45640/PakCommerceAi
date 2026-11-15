import type { z } from "zod";

import type { SellerContext } from "../middleware/seller-context.js";
import { databaseToolAudit } from "../tools/audit.js";
import "../tools/definitions.js";
import {
  getTools,
  runTool,
  type ToolAuditSink,
  type ToolContext,
  type ToolDefinition,
} from "../tools/registry.js";

/**
 * Turns registry definitions into what the Vercel AI SDK's `streamText` wants.
 *
 * This file is the only place the copilot's framework meets the registry. The
 * registry itself stays provider-neutral; swap the SDK and only this adapter
 * changes.
 *
 * The SDK has already validated the model's arguments against `inputSchema`, so
 * `runTool` is told not to parse again. If a tool throws, the original error is
 * rethrown so the SDK reports it exactly as it did before the registry existed.
 */

export interface AiSdkTool {
  description: string;
  inputSchema: z.ZodType;
  needsApproval?: true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any) => Promise<unknown>;
}

export function toAiSdkTools(
  defs: ToolDefinition[],
  ctx: ToolContext,
): Record<string, AiSdkTool> {
  return Object.fromEntries(
    defs.map((def) => [
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        ...(def.needsApproval ? { needsApproval: true as const } : {}),
        execute: async (input: unknown) => {
          const result = await runTool(def, ctx, input, { validate: false });
          if (result.ok) return result.output;
          throw result.cause;
        },
      },
    ]),
  );
}

/** `toolApproval` entries: every tool that needs a human yes gets "user-approval". */
export function toolApprovalMap(defs: ToolDefinition[]): Record<string, "user-approval"> {
  return Object.fromEntries(
    defs.filter((def) => def.needsApproval).map((def) => [def.name, "user-approval" as const]),
  );
}

export function copilotToolContext(
  auth: SellerContext,
  audit: ToolAuditSink = databaseToolAudit,
): ToolContext {
  return {
    db: auth.db,
    workspaceId: null,
    sellerId: auth.sellerId,
    // Runs as the seller, under their RLS, after their approval for writes.
    actor: "seller",
    audience: "copilot",
    audit,
  };
}

/** The tools and approval map for one copilot request. */
export function createCopilotToolSet(auth: SellerContext) {
  const defs = getTools({ audience: "copilot" });
  return {
    tools: toAiSdkTools(defs, copilotToolContext(auth)),
    toolApproval: toolApprovalMap(defs),
  };
}
