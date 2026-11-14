import {
  CUSTOMER_RECENT_ORDERS_LIMIT,
  CUSTOMER_TIMELINE_LIMIT,
  normalizePhone,
  type ApiMeta,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerNote,
  type ParsedCreateCustomerNoteInput,
  type ParsedCustomerSearchQuery,
} from "@pakcommerce/shared";

import { NotFoundError } from "../lib/http-errors.js";
import { decodePageCursor, encodePageCursor } from "../lib/page-cursor.js";
import type { SellerContext } from "../middleware/seller-context.js";
import { listOrders } from "../orders/order-service.js";
import {
  toCustomerDetail,
  toCustomerListItem,
  toCustomerNote,
  toTimeline,
  type CustomerNoteRow,
  type CustomerSummaryRow,
  type TimelineHistoryRow,
} from "./customer-mapper.js";

/**
 * Customer 360: list/search, profile, and notes.
 *
 * Every query goes through `auth.db` (seller token), so RLS scopes rows inside
 * Postgres - there is never a `where seller_id`. Customers themselves are not
 * created here: the database links each order to a customer by phone
 * (`link_order_to_customer`). Spend and counts are computed by the
 * `customer_summary` view.
 */

export async function listCustomers(
  auth: SellerContext,
  query: ParsedCustomerSearchQuery,
): Promise<{ items: CustomerListItem[]; meta: ApiMeta; nextCursor: string | null }> {
  const page = decodePageCursor(query.cursor);
  const offset = (page - 1) * query.limit;

  let builder = auth.db
    .from("customer_summary")
    .select("*", { count: "exact" })
    .eq("workspace_id", query.workspaceId);

  // Derived tags are conditions on the computed columns. Several tags narrow.
  for (const tag of query.tags ?? []) {
    switch (tag) {
      case "new":
        builder = builder.eq("completed_order_count", 0);
        break;
      case "repeat":
        builder = builder.gte("completed_order_count", 2);
        break;
      case "has_returns":
        builder = builder.gte("returned_order_count", 1);
        break;
      case "flagged":
        builder = builder.gte("risk_note_count", 1);
        break;
    }
  }

  if (query.query) {
    builder = builder.or(searchFilter(query.query));
  }

  builder = applyCustomerSort(builder, query.sort);

  const { data, count, error } = await builder.range(offset, offset + query.limit - 1);

  if (error) throw new Error(error.message, { cause: error });

  const rows = (data ?? []) as unknown as CustomerSummaryRow[];
  const total = count ?? 0;

  return {
    items: rows.map(toCustomerListItem),
    meta: { page, pageSize: query.limit, total },
    nextCursor: offset + rows.length < total ? encodePageCursor(page + 1) : null,
  };
}

export async function getCustomerDetail(
  auth: SellerContext,
  workspaceId: string,
  customerId: string,
): Promise<CustomerDetail> {
  const { data, error } = await auth.db
    .from("customer_summary")
    .select("*")
    .eq("id", customerId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message, { cause: error });
  if (!data) throw new NotFoundError("Customer not found.");

  const [orders, notes, history] = await Promise.all([
    listOrders(auth, {
      workspaceId,
      customerId,
      sort: "newest",
      limit: CUSTOMER_RECENT_ORDERS_LIMIT,
    }),
    listNoteRows(auth, workspaceId, customerId),
    listHistoryRows(auth, customerId),
  ]);

  return toCustomerDetail(
    toCustomerListItem(data as unknown as CustomerSummaryRow),
    orders.items,
    notes.map(toCustomerNote),
    toTimeline(history, notes),
  );
}

export async function createCustomerNote(
  auth: SellerContext,
  customerId: string,
  input: ParsedCreateCustomerNoteInput,
): Promise<CustomerNote> {
  await assertCustomerExists(auth, input.workspaceId, customerId);

  const { data, error } = await auth.db
    .from("customer_notes")
    .insert({
      customer_id: customerId,
      workspace_id: input.workspaceId,
      seller_id: auth.sellerId,
      kind: input.kind,
      body: input.body,
      created_by: auth.sellerId,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message, { cause: error });

  return toCustomerNote(data as CustomerNoteRow);
}

export async function deleteCustomerNote(
  auth: SellerContext,
  workspaceId: string,
  customerId: string,
  noteId: string,
): Promise<void> {
  const { data, error } = await auth.db
    .from("customer_notes")
    .delete()
    .eq("id", noteId)
    .eq("customer_id", customerId)
    .eq("workspace_id", workspaceId)
    .select("id");

  if (error) throw new Error(error.message, { cause: error });
  if (!data || data.length === 0) throw new NotFoundError("Note not found.");
}

async function assertCustomerExists(
  auth: SellerContext,
  workspaceId: string,
  customerId: string,
): Promise<void> {
  const { data, error } = await auth.db
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message, { cause: error });
  if (!data) throw new NotFoundError("Customer not found.");
}

async function listNoteRows(
  auth: SellerContext,
  workspaceId: string,
  customerId: string,
): Promise<CustomerNoteRow[]> {
  const { data, error } = await auth.db
    .from("customer_notes")
    .select("*")
    .eq("customer_id", customerId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message, { cause: error });
  return (data ?? []) as CustomerNoteRow[];
}

/** Newest status changes across all of this customer's orders. */
async function listHistoryRows(
  auth: SellerContext,
  customerId: string,
): Promise<TimelineHistoryRow[]> {
  const { data, error } = await auth.db
    .from("order_status_history")
    .select("id, order_id, from_status, to_status, note, created_at, orders!inner(customer_id)")
    .eq("orders.customer_id", customerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(CUSTOMER_TIMELINE_LIMIT);

  if (error) throw new Error(error.message, { cause: error });
  return (data ?? []) as unknown as TimelineHistoryRow[];
}

/**
 * The `.or()` predicate for a free-text search.
 *
 * Matches name, phone, city and email. A typed phone in any format also matches
 * through its normalised form (`0300-1234567` finds `+923001234567`), and a
 * partial local number starting with 0 matches the `+92` stored form.
 */
export function searchFilter(term: string): string {
  const patterns = new Set<string>([term]);

  const normalized = normalizePhone(term);
  if (normalized) patterns.add(normalized);

  if (/^[0-9 ()+.-]+$/.test(term)) {
    const digits = term.replace(/[^0-9]/g, "");
    if (digits.startsWith("0") && digits.length > 1) {
      patterns.add(`+92${digits.slice(1)}`);
    }
  }

  const textColumns = ["name", "city", "email"];
  const parts = [...patterns].flatMap((pattern) => {
    const value = likeValue(pattern);
    return pattern === term
      ? [...textColumns, "phone"].map((column) => `${column}.ilike.${value}`)
      : [`phone.ilike.${value}`];
  });

  return parts.join(",");
}

/** A quoted, escaped `%value%` for a PostgREST `ilike` filter. */
function likeValue(value: string): string {
  // First make LIKE wildcards literal, then escape for PostgREST's quoted form.
  const literal = value.replace(/[\\%_]/g, "\\$&");
  const quoted = literal.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${quoted}%"`;
}

function applyCustomerSort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  builder: any,
  sort: ParsedCustomerSearchQuery["sort"],
) {
  switch (sort) {
    case "spend_desc":
      return builder
        .order("lifetime_spend_amount_minor", { ascending: false })
        .order("id", { ascending: true });
    case "name_asc":
      return builder.order("name", { ascending: true }).order("id", { ascending: true });
    case "created_desc":
      return builder
        .order("created_at", { ascending: false })
        .order("id", { ascending: true });
    case "last_order_desc":
    default:
      return builder
        .order("last_order_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true });
  }
}
