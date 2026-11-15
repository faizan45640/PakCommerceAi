import type { AppSupabaseClient } from "@pakcommerce/integrations/supabase";
import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

/**
 * The shared tool registry.
 *
 * Business tools are defined ONCE here and consumed by every AI caller: the
 * seller copilot (Rafiq, Vercel AI SDK, in-process) and the WhatsApp sales
 * agent (Python LangGraph, over HTTP - see agent-router.ts).
 *
 * Nothing in this file knows about the Vercel AI SDK or any LLM provider. A
 * definition is a name, a zod schema, a permission, an owner and an `execute`.
 * Adapters turn that into whatever a framework wants (ai-sdk-adapter.ts for the
 * copilot, JSON Schema over HTTP for the agent).
 */

export type ToolPermission = "read" | "write";
export type ToolAudience = "copilot" | "sales_agent";
export type ToolActor = "seller" | "ai";
export type ToolOwner =
  | "catalog"
  | "inventory"
  | "orders"
  | "customers"
  | "analytics"
  | "logistics"
  | "platform";

export interface ToolAuditEntry {
  /** Id of the audit row, fixed before the tool runs so the tool can reference it. */
  id?: string;
  toolName: string;
  audience: ToolAudience;
  actor: ToolActor;
  sellerId: string | null;
  workspaceId: string | null;
  conversationId: string | null;
  ok: boolean;
  errorCode: string | null;
  durationMs: number;
  /** Already redacted. */
  input: unknown;
}

/** Where audit entries go. A failing sink never breaks the tool call. */
export interface ToolAuditSink {
  record(entry: ToolAuditEntry): Promise<void>;
}

export interface ToolContext {
  /** RLS client (copilot, acts as the seller) or admin client (sales agent). */
  db: AppSupabaseClient;
  /**
   * The workspace this call is scoped to. Sales agent: always set, derived from
   * the conversation. Copilot: null, the seller's tools resolve it themselves
   * under RLS.
   */
  workspaceId: string | null;
  sellerId?: string;
  actor: ToolActor;
  audience: ToolAudience;
  conversationId?: string;
  /**
   * Id the audit row of THIS call will get. Set by `runTool`; a tool that
   * creates a record (an AI draft order) stores it as `created_by_tool_call_id`.
   */
  toolCallId?: string;
  audit: ToolAuditSink;
}

// `any` defaults so differently-typed tools fit one registry; define each with its own types.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ToolDefinition<TInput = any, TOutput = unknown> {
  /** Unique across the registry. camelCase, it is shown to the model. */
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput, any>;
  outputSchema?: z.ZodType<TOutput>;
  permission: ToolPermission;
  owner: ToolOwner;
  audiences: ToolAudience[];
  /** A human must approve before this runs (copilot: the seller; agent: refused). */
  needsApproval: boolean;
  audit: {
    /** Dotted input paths replaced with "[redacted]" in the audit row. */
    redact?: string[];
    /**
     * Input fields holding SQL. Never stored verbatim (it can embed buyer data):
     * replaced by `{ kind, sha256, length }`.
     */
    sqlFields?: string[];
  };
  execute(ctx: ToolContext, input: TInput): Promise<TOutput>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A failure the caller may be told about. Anything else becomes internal_error. */
export class ToolError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.status = status;
  }
}

export interface ToolRegistry {
  register(def: ToolDefinition): void;
  get(name: string): ToolDefinition | undefined;
  list(filter?: { audience?: ToolAudience }): ToolDefinition[];
}

const TOOL_NAME = /^[a-z][A-Za-z0-9]*$/;

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();

  return {
    register(def) {
      if (!TOOL_NAME.test(def.name)) {
        throw new Error(`Invalid tool name "${def.name}": use camelCase letters and digits.`);
      }
      if (tools.has(def.name)) {
        throw new Error(`Duplicate tool name "${def.name}".`);
      }
      if (def.audiences.length === 0) {
        throw new Error(`Tool "${def.name}" must have at least one audience.`);
      }
      tools.set(def.name, def);
    },
    get: (name) => tools.get(name),
    list: (filter) =>
      [...tools.values()].filter(
        (def) => !filter?.audience || def.audiences.includes(filter.audience),
      ),
  };
}

/** The process-wide registry. Populated by ./definitions.ts. */
export const toolRegistry = createToolRegistry();

export const registerTool = (def: ToolDefinition) => toolRegistry.register(def);
export const getTool = (name: string) => toolRegistry.get(name);
export const getTools = (filter?: { audience?: ToolAudience }) => toolRegistry.list(filter);

/** JSON Schema (draft 2020-12) of a tool's input, for non-TypeScript callers. */
export function toolInputJsonSchema(def: ToolDefinition): Record<string, unknown> {
  // `io: "input"`: describe what a caller sends, so defaults and preprocessors
  // do not make fields look required or opaque.
  return z.toJSONSchema(def.inputSchema, { io: "input", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
}

export interface ToolSummary {
  name: string;
  description: string;
  permission: ToolPermission;
  owner: ToolOwner;
  needsApproval: boolean;
  inputSchema: Record<string, unknown>;
}

export function describeTool(def: ToolDefinition): ToolSummary {
  return {
    name: def.name,
    description: def.description,
    permission: def.permission,
    owner: def.owner,
    needsApproval: def.needsApproval,
    inputSchema: toolInputJsonSchema(def),
  };
}

const REDACTED = "[redacted]";
const MAX_AUDIT_STRING = 2000;

function redactPath(target: unknown, path: string[]): void {
  if (path.length === 0 || target === null || typeof target !== "object") return;
  const [head, ...rest] = path as [string, ...string[]];
  if (head === "*" && Array.isArray(target)) {
    for (const item of target) redactPath(item, rest);
    return;
  }
  const record = target as Record<string, unknown>;
  if (!(head in record)) return;
  if (rest.length === 0) record[head] = REDACTED;
  else redactPath(record[head], rest);
}

function truncate(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_AUDIT_STRING ? `${value.slice(0, MAX_AUDIT_STRING)}...` : value;
  }
  if (Array.isArray(value)) return value.map(truncate);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, truncate(v)]));
  }
  return value;
}

/** Copy of the input with the tool's redact paths masked ("a.b", "items.*.x"). */
export function redactInput(def: ToolDefinition, input: unknown): unknown {
  let copy: unknown;
  try {
    copy = structuredClone(input ?? {});
  } catch {
    return {};
  }
  for (const field of def.audit.sqlFields ?? []) {
    const record = copy as Record<string, unknown>;
    if (record && typeof record === "object" && typeof record[field] === "string") {
      const sql = record[field] as string;
      record[field] = {
        kind: /^\s*([a-z]+)/i.exec(sql)?.[1]?.toLowerCase() ?? "unknown",
        sha256: createHash("sha256").update(sql).digest("hex"),
        length: sql.length,
      };
    }
  }
  for (const path of def.audit.redact ?? []) redactPath(copy, path.split("."));
  return truncate(copy);
}

export type ToolRunResult =
  | { ok: true; output: unknown }
  | {
      ok: false;
      error: { code: string; message: string };
      status: number;
      /** What the tool actually threw, for callers that must rethrow it. */
      cause: unknown;
    };

/** Output convention of the copilot tools: `{ status: "error", message }`. */
function reportedError(output: unknown): string | null {
  if (output && typeof output === "object" && (output as { status?: unknown }).status === "error") {
    return "tool_reported_error";
  }
  return null;
}

export interface RunToolOptions {
  /** Parse the input against the schema first. Off when the caller already did. */
  validate?: boolean;
}

/**
 * Runs a tool and audits the call. The one place every caller goes through, so
 * the audit trail has no gaps. Never throws: failures come back as `ok: false`
 * (with the original error in `cause`).
 */
export async function runTool(
  def: ToolDefinition,
  ctx: ToolContext,
  rawInput: unknown,
  options: RunToolOptions = {},
): Promise<ToolRunResult> {
  const started = Date.now();
  const toolCallId = randomUUID();
  ctx = { ...ctx, toolCallId };
  let result: ToolRunResult;
  let auditCode: string | null = null;

  try {
    let input = rawInput;
    if (options.validate !== false) {
      const parsed = def.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        throw new ToolError(
          "invalid_input",
          parsed.error.issues
            .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
            .join("; "),
          400,
        );
      }
      input = parsed.data;
    }
    const output = await def.execute(ctx, input);
    auditCode = reportedError(output);
    result = { ok: true, output };
  } catch (error) {
    if (error instanceof ToolError) {
      auditCode = error.code;
      result = {
        ok: false,
        error: { code: error.code, message: error.message },
        status: error.status,
        cause: error,
      };
    } else {
      auditCode = "internal_error";
      result = {
        ok: false,
        error: { code: "internal_error", message: "The tool failed." },
        status: 500,
        cause: error,
      };
    }
  }

  await recordToolAudit(def.name, def, ctx, rawInput, auditCode, Date.now() - started);

  return result;
}

/**
 * Writes one audit row, never throwing. Also used for calls refused before the
 * tool ran (approval, conversation state); `def` is null for an unknown tool,
 * whose input is not stored.
 */
export async function recordToolAudit(
  toolName: string,
  def: ToolDefinition | null,
  ctx: ToolContext,
  rawInput: unknown,
  errorCode: string | null,
  durationMs: number,
): Promise<void> {
  try {
    await ctx.audit.record({
      ...(ctx.toolCallId ? { id: ctx.toolCallId } : {}),
      toolName: toolName.slice(0, 100),
      audience: ctx.audience,
      actor: ctx.actor,
      sellerId: ctx.sellerId ?? null,
      workspaceId: ctx.workspaceId,
      conversationId: ctx.conversationId ?? null,
      ok: errorCode === null,
      errorCode,
      durationMs,
      input: def ? redactInput(def, rawInput) : {},
    });
  } catch (error) {
    // An audit outage must not break the shop assistant.
    console.error("Tool audit failed:", error);
  }
}
