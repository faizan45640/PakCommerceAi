"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { CustomerDetail, CustomerNote, CustomerNoteKind } from "@pakcommerce/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createCustomerNote, deleteCustomerNote } from "@/lib/api/customers";

import {
  MAX_CUSTOMER_NOTE_LENGTH,
  NOTE_KIND_LABELS,
  notesCapMessage,
  validateNoteDraft,
} from "./customer-notes";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function CustomerNotes({
  customer,
  workspaceId,
  userId,
  onChanged,
}: {
  customer: CustomerDetail;
  workspaceId: string;
  userId: string | null;
  onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState<CustomerNoteKind>("note");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomerNote | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const cap = notesCapMessage(customer.notes.length, customer.summary.noteCount);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const draft = validateNoteDraft({ kind, body });
    if (!draft.ok) {
      setErrorMessage(draft.error);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      await createCustomerNote(customer.id, { workspaceId, kind: draft.kind, body: draft.body });
      setBody("");
      setKind("note");
      await onChanged();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCustomerNote(workspaceId, customer.id, pendingDelete.id);
      setPendingDelete(null);
      await onChanged();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the note.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
        <CardDescription>
          Risk notes flag the customer, which shows on every order they place.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a note about this customer..."
            rows={3}
            maxLength={MAX_CUSTOMER_NOTE_LENGTH}
            aria-label="Note"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={kind}
              onValueChange={(value) => {
                if (value) setKind(value as CustomerNoteKind);
              }}
            >
              <ToggleGroupItem value="note">{NOTE_KIND_LABELS.note}</ToggleGroupItem>
              <ToggleGroupItem value="risk">{NOTE_KIND_LABELS.risk}</ToggleGroupItem>
            </ToggleGroup>
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs">
                {body.length}/{MAX_CUSTOMER_NOTE_LENGTH}
              </span>
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? "Saving..." : "Add note"}
              </Button>
            </div>
          </div>
          {errorMessage ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage}
            </p>
          ) : null}
        </form>

        {customer.notes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No notes yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {customer.notes.map((note) => (
              <li
                key={note.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                  note.kind === "risk" ? "border-destructive/50 bg-destructive/5" : "bg-muted/20"
                }`}
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {note.kind === "risk" ? (
                      <Badge variant="secondary" className="rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                        Risk
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground text-xs">{formatDateTime(note.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
                </div>
                {userId && note.createdBy === userId ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete(note);
                    }}
                  >
                    <span className="sr-only">Delete note</span>
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {cap ? <p className="text-muted-foreground text-xs">{cap}</p> : null}
      </CardContent>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this note?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.kind === "risk"
                ? "This is a risk note. If it is the only one, the customer will no longer be flagged."
                : "This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p role="alert" className="text-destructive text-sm">
              {deleteError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
