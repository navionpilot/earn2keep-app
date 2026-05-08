"use client";

// =============================================================================
// components/TeamInvitesButton.tsx — Client wrapper for SendInvitesModal
// =============================================================================
// app/teams/[id]/page.tsx is a Server Component; React state + click handlers
// for opening the modal need a client island. This is that island. It owns
// the open/closed state and renders the button + the modal. Players are
// passed in from the server-rendered parent.
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
}

export default function TeamInvitesButton({ players, teamName }: Props) {
  const [open, setOpen] = useState(false);

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
