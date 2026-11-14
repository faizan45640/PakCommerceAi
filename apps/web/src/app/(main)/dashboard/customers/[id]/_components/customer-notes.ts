import type { CustomerNoteKind } from "@pakcommerce/shared";
import {
  MAX_CUSTOMER_NOTE_LENGTH,
  createCustomerNoteInputSchema,
} from "@pakcommerce/shared/customers";

export const NOTE_KIND_LABELS: Record<CustomerNoteKind, string> = {
  note: "Note",
  risk: "Risk",
};

export { MAX_CUSTOMER_NOTE_LENGTH };

export type NoteDraftResult =
  | { ok: true; kind: CustomerNoteKind; body: string }
  | { ok: false; error: string };

/** Client-side check with the same schema the API uses. */
export function validateNoteDraft(input: { kind: CustomerNoteKind; body: string }): NoteDraftResult {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, error: "Write a note first." };
  if (body.length > MAX_CUSTOMER_NOTE_LENGTH) {
    return { ok: false, error: `Notes can be at most ${MAX_CUSTOMER_NOTE_LENGTH} characters.` };
  }

  const parsed = createCustomerNoteInputSchema.safeParse({
    // The workspace id is added when sending; any uuid satisfies the schema here.
    workspaceId: "00000000-0000-4000-8000-000000000000",
    kind: input.kind,
    body,
  });
  if (!parsed.success) return { ok: false, error: "This note is not valid." };
  return { ok: true, kind: parsed.data.kind, body: parsed.data.body };
}

/** "Showing 50 of 63 notes" when the API capped the list, otherwise null. */
export function notesCapMessage(shown: number, total: number): string | null {
  return total > shown ? `Showing ${shown} of ${total} notes` : null;
}
