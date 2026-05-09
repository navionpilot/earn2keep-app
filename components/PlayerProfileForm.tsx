"use client";

// =============================================================================
// components/PlayerProfileForm.tsx — Player-editable profile form (Slice 5.5)
// =============================================================================
// Sections:
//   1. Photo (uses <PlayerAvatarUpload>)
//   2. Pronouns (single-line input, ≤30 char)
//   3. Bio (textarea, ≤200 char w/ live counter)
//   4. Email preferences (just one toggle for now: notify on review)
//   5. Read-only team info block (name, jersey, team, org, email, joined)
//
// All saves go through a single supabase.from("players").update(...).
// The DB trigger from Slice 5.5 SQL ensures the player can't sneak in
// updates to coach-managed fields like first_name/jersey_number — even
// if a malicious client crafted a payload, the trigger would reject.
// =============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import PlayerAvatarUpload from "./PlayerAvatarUpload";

interface NotificationPrefs {
  submission_reviewed?: boolean;
}

interface Props {
  playerId: string;
  firstName: string;
  lastName: string | null;
  jerseyNumber: string | null;
  parentEmail: string | null;
  avatarUrl: string | null;
  pronouns: string | null;
  bio: string | null;
  notificationPrefs: NotificationPrefs | null;
  teamName: string | null;
  orgName: string | null;
  authEmail: string | null;
  joinedDate: string | null;
}

const BIO_MAX = 200;
const PRONOUNS_MAX = 30;

export default function PlayerProfileForm(props: Props) {
  const router = useRouter();

  // Editable fields stay as local state. The avatar lives in its own
  // child but its URL bubbles up via onAvatarChange so saves include it.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(props.avatarUrl);
  const [pronouns, setPronouns] = useState(props.pronouns ?? "");
  const [bio, setBio] = useState(props.bio ?? "");
  const [notifyOnReview, setNotifyOnReview] = useState<boolean>(
    props.notificationPrefs?.submission_reviewed ?? true
  );

  // Save state for the button + toast.
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<
    { kind: "ok" | "err"; msg: string } | null
  >(null);

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("players")
        .update({
          avatar_url: avatarUrl,
          pronouns: pronouns.trim() || null,
          bio: bio.trim() || null,
          notification_prefs: {
            submission_reviewed: notifyOnReview,
          },
        })
        .eq("id", props.playerId);

      if (error) {
        setToast({ kind: "err", msg: error.message });
        return;
      }
      setToast({ kind: "ok", msg: "✓ Profile saved" });
      // Re-render server components so PlayerTopBar / sponsor card see
      // the new avatar/pronouns immediately on next nav.
      router.refresh();
      setTimeout(() => setToast(null), 2200);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Couldn't save profile.";
      setToast({ kind: "err", msg: message });
    } finally {
      setSaving(false);
    }
  };

  const bioRemaining = BIO_MAX - bio.length;
  const pronounsRemaining = PRONOUNS_MAX - pronouns.length;
  const canSave = !saving;

  return (
    <div className="profile-form">
      {/* ============================================================
          Section 1 — Photo
          ============================================================ */}
      <section className="profile-section">
        <h2 className="profile-section-title">Profile photo</h2>
        <p className="profile-section-help">
          Your photo shows up in the top bar, on the leaderboard, and on
          your sponsor page. Square works best.
        </p>
        <PlayerAvatarUpload
          playerId={props.playerId}
          currentUrl={avatarUrl}
          firstName={props.firstName}
          lastName={props.lastName}
          onChange={setAvatarUrl}
        />
      </section>

      {/* ============================================================
          Section 2 — Pronouns
          ============================================================ */}
      <section className="profile-section">
        <h2 className="profile-section-title">Pronouns</h2>
        <p className="profile-section-help">
          Optional. Shown next to your name on your home page and sponsor
          page. Examples: he/him, she/her, they/them.
        </p>
        <div className="profile-input-row">
          <input
            type="text"
            className="form-input"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value.slice(0, PRONOUNS_MAX))}
            placeholder="(leave blank to skip)"
            maxLength={PRONOUNS_MAX}
          />
          <span className="profile-counter">
            {pronounsRemaining} left
          </span>
        </div>
      </section>

      {/* ============================================================
          Section 3 — Bio
          ============================================================ */}
      <section className="profile-section">
        <h2 className="profile-section-title">Short bio</h2>
        <p className="profile-section-help">
          Tell sponsors a little about yourself — what sport you play, what
          you&apos;re training for, why this event matters to you.
          (Up to {BIO_MAX} characters.)
        </p>
        <textarea
          className="form-textarea profile-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          placeholder="Hi! I'm raising money for our team's summer camp..."
          maxLength={BIO_MAX}
          rows={4}
        />
        <div className="profile-counter profile-counter-right">
          {bioRemaining} characters left
        </div>
      </section>

      {/* ============================================================
          Section 4 — Email preferences
          ============================================================ */}
      <section className="profile-section">
        <h2 className="profile-section-title">Email notifications</h2>
        <p className="profile-section-help">
          We&apos;ll only email about things you&apos;re actually involved
          in. (Push and SMS land in a future update.)
        </p>
        <label className="profile-toggle">
          <input
            type="checkbox"
            checked={notifyOnReview}
            onChange={(e) => setNotifyOnReview(e.target.checked)}
          />
          <span>
            Email me when my coach reviews a submission
          </span>
        </label>
      </section>

      {/* ============================================================
          Section 5 — Read-only info
          ============================================================ */}
      <section className="profile-section profile-section-readonly">
        <h2 className="profile-section-title">Roster details</h2>
        <p className="profile-section-help">
          These are managed by your coach — message them if anything looks
          wrong.
        </p>
        <dl className="profile-readonly-list">
          <div className="profile-readonly-row">
            <dt>Name</dt>
            <dd>
              {props.firstName}
              {props.lastName ? ` ${props.lastName}` : ""}
            </dd>
          </div>
          {props.jerseyNumber && (
            <div className="profile-readonly-row">
              <dt>Jersey #</dt>
              <dd>{props.jerseyNumber}</dd>
            </div>
          )}
          {props.teamName && (
            <div className="profile-readonly-row">
              <dt>Team</dt>
              <dd>{props.teamName}</dd>
            </div>
          )}
          {props.orgName && (
            <div className="profile-readonly-row">
              <dt>Organization</dt>
              <dd>{props.orgName}</dd>
            </div>
          )}
          {props.parentEmail && (
            <div className="profile-readonly-row">
              <dt>Parent email on file</dt>
              <dd>{props.parentEmail}</dd>
            </div>
          )}
          {props.authEmail && (
            <div className="profile-readonly-row">
              <dt>Sign-in email</dt>
              <dd>{props.authEmail}</dd>
            </div>
          )}
          {props.joinedDate && (
            <div className="profile-readonly-row">
              <dt>Joined</dt>
              <dd>{props.joinedDate}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ============================================================
          Save bar (sticky on desktop, bottom on mobile)
          ============================================================ */}
      <div className="profile-save-bar">
        {toast && (
          <div
            className={`profile-toast profile-toast-${toast.kind}`}
            role="status"
          >
            {toast.msg}
          </div>
        )}
        <button
          type="button"
          className="profile-save-btn"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
