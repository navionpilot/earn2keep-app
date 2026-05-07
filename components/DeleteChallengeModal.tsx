"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export type ChallengeToDelete = {
  id: string;
  name: string;
  is_public: boolean;
  owner_id: string | null;
};

type EventScheduleImpact = {
  eventId: string;
  eventName: string;
  dayCount: number;
};

interface DeleteChallengeModalProps {
  open: boolean;
  onClose: () => void;
  challenges: ChallengeToDelete[]; // 1 or many
  currentUserId: string;
  isAdmin: boolean;
  onDeleted: () => void; // parent refetches after success
}

export default function DeleteChallengeModal({
  open,
  onClose,
  challenges,
  currentUserId,
  isAdmin,
  onDeleted,
}: DeleteChallengeModalProps) {
  const [scheduleImpacts, setScheduleImpacts] = useState<Record<string, EventScheduleImpact[]>>({});
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  // Filter to challenges the user is actually allowed to delete
  const deletable = challenges.filter((c) => {
    if (isAdmin) return true; // admin can delete anything
    if (c.is_public) return false; // non-admin cannot delete public seeded challenges
    return c.owner_id === currentUserId;
  });

  const blocked = challenges.filter((c) => !deletable.find((d) => d.id === c.id));

  const isBulk = deletable.length > 1;
  const requiresTypedConfirm = deletable.length >= 5; // typed "delete" required for big bulk deletes

  // When modal opens, load schedule impact for all deletable challenges
  useEffect(() => {
    if (!open || deletable.length === 0) return;
    const fetchImpacts = async () => {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const ids = deletable.map((c) => c.id);
      const { data: rows, error: fetchErr } = await supabase
        .from("event_challenges")
        .select("challenge_id, event_id, day_index, events(id, name)")
        .in("challenge_id", ids);

      if (fetchErr) {
        setError(fetchErr.message);
        setLoading(false);
        return;
      }

      // Group by challenge_id → event_id → day count
      const impacts: Record<string, EventScheduleImpact[]> = {};
      for (const c of deletable) impacts[c.id] = [];

      const byChallengeAndEvent: Record<string, { eventName: string; days: Set<number> }> = {};
      (rows || []).forEach((r: any) => {
        const key = `${r.challenge_id}::${r.event_id}`;
        if (!byChallengeAndEvent[key]) {
          byChallengeAndEvent[key] = {
            eventName: r.events?.name || "Untitled event",
            days: new Set(),
          };
        }
        byChallengeAndEvent[key].days.add(r.day_index);
      });

      Object.entries(byChallengeAndEvent).forEach(([key, value]) => {
        const [challengeId, eventId] = key.split("::");
        if (!impacts[challengeId]) impacts[challengeId] = [];
        impacts[challengeId].push({
          eventId,
          eventName: value.eventName,
          dayCount: value.days.size,
        });
      });

      setScheduleImpacts(impacts);
      setLoading(false);
    };
    fetchImpacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const totalDayImpact = Object.values(scheduleImpacts).reduce((sum, list) => {
    return sum + list.reduce((s, i) => s + i.dayCount, 0);
  }, 0);

  const totalEventImpact = new Set(
    Object.values(scheduleImpacts).flatMap((list) => list.map((i) => i.eventId))
  ).size;

  const challengesWithSchedule = Object.entries(scheduleImpacts).filter(([, impacts]) => impacts.length > 0).length;

  const handleDelete = async () => {
    if (deletable.length === 0) {
      setError("Nothing to delete.");
      return;
    }
    if (requiresTypedConfirm && confirmText.toLowerCase() !== "delete") {
      setError(`Type "delete" to confirm.`);
      return;
    }

    setDeleting(true);
    setError(null);
    const supabase = createClient();

    // Delete event_challenges rows first (manual cascade — RLS-friendly)
    const ids = deletable.map((c) => c.id);
    const { error: ecErr } = await supabase
      .from("event_challenges")
      .delete()
      .in("challenge_id", ids);
    if (ecErr) {
      setError(`Failed to remove from schedules: ${ecErr.message}`);
      setDeleting(false);
      return;
    }

    // Delete the challenges
    const { error: chErr } = await supabase
      .from("challenges")
      .delete()
      .in("id", ids);
    if (chErr) {
      setError(`Failed to delete challenges: ${chErr.message}`);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    setConfirmText("");
    onDeleted();
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-eyebrow">⚠ Permanent Delete</div>
            <h2 className="modal-title">
              {isBulk
                ? `Delete ${deletable.length} challenges?`
                : `Delete "${deletable[0]?.name || "this challenge"}"?`}
            </h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {blocked.length > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: "12px" }}>
              ⚠ {blocked.length} challenge{blocked.length === 1 ? " was" : "s were"} skipped:
              they are public/seeded library challenges that only the platform admin can delete.
            </div>
          )}

          {deletable.length === 0 ? (
            <p className="dashboard-card-text">
              Nothing to delete. Close this dialog.
            </p>
          ) : (
            <>
              <p className="delete-modal-intro">
                {isBulk
                  ? `You are about to permanently delete ${deletable.length} challenges. This cannot be undone.`
                  : `This will permanently delete "${deletable[0].name}". This cannot be undone.`}
              </p>

              {loading ? (
                <p className="dashboard-card-text" style={{ fontStyle: "italic" }}>
                  Checking event schedules...
                </p>
              ) : challengesWithSchedule > 0 ? (
                <div className="delete-modal-impact-block">
                  <div className="delete-modal-impact-header">
                    📅 Schedule impact
                  </div>
                  <p className="delete-modal-impact-summary">
                    {isBulk
                      ? `${challengesWithSchedule} of these challenges are scheduled across ${totalEventImpact} event${totalEventImpact === 1 ? "" : "s"} on ${totalDayImpact} day${totalDayImpact === 1 ? "" : "s"} total.`
                      : `This challenge is scheduled on ${totalDayImpact} day${totalDayImpact === 1 ? "" : "s"} of ${totalEventImpact} event${totalEventImpact === 1 ? "" : "s"}.`}
                    {" "}Those days will be cleared automatically.
                  </p>

                  <ul className="delete-modal-impact-list">
                    {Object.entries(scheduleImpacts).map(([challengeId, impacts]) => {
                      if (impacts.length === 0) return null;
                      const challenge = deletable.find((c) => c.id === challengeId);
                      if (!challenge) return null;
                      return (
                        <li key={challengeId}>
                          <strong>{challenge.name}</strong>
                          {" — "}
                          {impacts.map((imp, i) => (
                            <span key={imp.eventId}>
                              {i > 0 && ", "}
                              {imp.dayCount} day{imp.dayCount === 1 ? "" : "s"} of "{imp.eventName}"
                            </span>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="delete-modal-impact-summary delete-modal-impact-clean">
                  ✓ Not currently scheduled on any event. Safe to delete.
                </p>
              )}

              {requiresTypedConfirm && (
                <div style={{ marginTop: "16px" }}>
                  <label htmlFor="confirmText" className="form-label">
                    Type <code>delete</code> to confirm:
                  </label>
                  <input
                    id="confirmText"
                    type="text"
                    className="form-input"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="delete"
                    autoComplete="off"
                  />
                </div>
              )}

              {error && <div className="alert alert-error" style={{ marginTop: "12px" }}>{error}</div>}
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={deleting}>
              Cancel
            </button>
            {deletable.length > 0 && (
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleting || loading || (requiresTypedConfirm && confirmText.toLowerCase() !== "delete")}
              >
                {deleting
                  ? "Deleting..."
                  : isBulk
                    ? `Delete ${deletable.length} permanently`
                    : "Delete permanently"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
