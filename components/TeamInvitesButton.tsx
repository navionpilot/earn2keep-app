"use client";

// =============================================================================
// components/TeamInvitesButton.tsx — Client wrapper for SendInvitesModal
// =============================================================================
// app/teams/[id]/page.tsx is a Server Component; React state + click handlers
// for opening the modal need a client island. This is that island.
//
// Slice 5.7: accepts an optional `defaultOpen` prop. When `true`, the modal
// renders open immediately on mount. The team page sets this from the URL's
// ?send=true query string, so deep-links from the dashboard / event guide
// like `/teams/<id>?send=true` go straight into the invite-sending UI.
// =============================================================================

import { useState } from "react";
import SendInvitesModal from "./SendInvitesModal";

interface PlayerProp {
  id: string;
  first_name: string;
  last_name: string | null;
  parent_email: string | null;
  linked_user_id?: string | null;
}

interface Props {
  players: PlayerProp[];
  teamName: string;
  // Slice 5.7: when true (typically because the URL had ?send=true), open
  // the modal immediately instead of waiting for a click.
  defaultOpen?: boolean;
}

export default function TeamInvitesButton({
  players,
  teamName,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // Only show the button if the team actually has players.
  if (players.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="btn-add"
        onClick={() => setOpen(true)}
        title="Generate invite links for players to join earn²keep"
      >
        ✉ Send Invites
      </button>
      <SendInvitesModal
        open={open}
        onClose={() => setOpen(false)}
        players={players}
        teamName={teamName}
      />
    </>
  );
}
