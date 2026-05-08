import { redirect } from "next/navigation";

// /participants no longer has its own page. Roster management happens inside
// each team. Redirect to the Teams index so any bookmarked links still work.
export default function ParticipantsRedirect() {
  redirect("/teams");
}
