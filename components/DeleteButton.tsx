"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface DeleteButtonProps {
  table: "events" | "teams";
  recordId: string;
  recordName: string;
  redirectTo: string;
  // Summary of what will be lost (e.g., "3 challenges, 2 prizes, 1 team link")
  consequences: string[];
  buttonLabel?: string;
}

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

  const handleDelete = async () => {
    setError(null);
    setStage("deleting");

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq("id", recordId);

    if (deleteError) {
      setError(deleteError.message);
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
          Permanently delete this {table === "events" ? "event" : "team"}. This
          action cannot be undone.
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
        You're about to permanently delete{" "}
        <strong>"{recordName}"</strong>. This cannot be undone.
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
