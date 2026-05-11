"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// Tables this button can delete from. Slice 8.7 adds "organizations".
// If you add another table here, also add a DELETE RLS policy for it.
type DeletableTable = "events" | "teams" | "organizations";

interface DeleteButtonProps {
  table: DeletableTable;
  recordId: string;
  recordName: string;
  redirectTo: string;
  // Summary of what will be lost (e.g., "3 challenges, 2 prizes, 1 team link")
  consequences: string[];
  buttonLabel?: string;
}

// User-friendly singular label for messaging
const SINGULAR_LABEL: Record<DeletableTable, string> = {
  events: "event",
  teams: "team",
  organizations: "organization",
};

export default function DeleteButton({
  table,
  recordId,
  recordName,
  redirectTo,
  consequences,
  buttonLabel = "Delete",
}: DeleteButtonProps) {
  const [stage, setStage] = useState<"idle" | "confirming" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const singular = SINGULAR_LABEL[table];

  const handleDelete = async () => {
    setError(null);
    setStage("deleting");

    const supabase = createClient();
    // Slice 8.7 — chain .select() so we get back the rows actually deleted.
    // Without this, Supabase reports success even when RLS filters out the
    // delete (zero rows affected, no error). We need to detect that case
    // and tell the user clearly instead of redirecting them away from
    // a record that's still in the database.
    const { data, error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("id", recordId)
      .select("id");

    if (deleteError) {
      // Surface the raw Supabase error. Often this is a foreign-key
      // constraint violation, which tells the user they need to remove
      // dependent records (events, players, etc.) before deleting.
      setError(humanizeDeleteError(deleteError.message, singular));
      setStage("confirming");
      return;
    }

    if (!data || data.length === 0) {
      // No rows affected → almost always RLS silently filtering the delete.
      // The DB call succeeded but did nothing. Tell the user explicitly.
      setError(
        `Couldn't delete this ${singular}. The database accepted the request but no row was removed. ` +
          `Usually this means the security rule for deleting ${table} hasn't been added yet — ` +
          `tell the developer to run the latest migration.`
      );
      setStage("confirming");
      return;
    }

    startTransition(() => {
      router.push(redirectTo);
      router.refresh();
    });
  };

  if (stage === "idle") {
    return (
      <div className="delete-section">
        <h3 className="delete-section-title">Danger Zone</h3>
        <p className="delete-section-text">
          Permanently delete this {singular}. This action cannot be undone.
        </p>
        <button
          type="button"
          className="btn-danger"
          onClick={() => setStage("confirming")}
        >
          🗑 {buttonLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="delete-section delete-section-confirming">
      <h3 className="delete-section-title delete-section-title-warning">
        ⚠ Are you sure?
      </h3>
      <p className="delete-section-text">
        You&apos;re about to permanently delete{" "}
        <strong>&quot;{recordName}&quot;</strong>. This cannot be undone.
      </p>
      {consequences.length > 0 && (
        <div className="delete-consequences">
          <p className="delete-consequences-title">The following will also be removed:</p>
          <ul className="delete-consequences-list">
            {consequences.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <div className="alert alert-error" style={{ marginTop: "12px" }}>
          {error}
        </div>
      )}
      <div className="delete-actions">
        <button
          type="button"
          className="btn-cancel"
          onClick={() => {
            setStage("idle");
            setError(null);
          }}
          disabled={stage === "deleting" || isPending}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-danger-confirm"
          onClick={handleDelete}
          disabled={stage === "deleting" || isPending}
        >
          {stage === "deleting" || isPending
            ? "Deleting..."
            : `Yes, permanently delete`}
        </button>
      </div>
    </div>
  );
}

// Slice 8.7 — convert raw Supabase/Postgres error messages into something
// a non-technical coach can actually act on. Falls back to the raw message
// for anything we don't recognize.
function humanizeDeleteError(rawMsg: string, singular: string): string {
  const msg = rawMsg.toLowerCase();
  if (msg.includes("foreign key") || msg.includes("violates foreign key constraint")) {
    return (
      `This ${singular} has dependent records that need to be removed first ` +
      `(teams, events, players, or submissions). Open this ${singular} and ` +
      `delete its child records before trying again.`
    );
  }
  if (msg.includes("permission denied") || msg.includes("policy")) {
    return `You don't have permission to delete this ${singular}.`;
  }
  return rawMsg;
}
