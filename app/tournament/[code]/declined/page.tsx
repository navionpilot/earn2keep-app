// =============================================================================
// app/tournament/[code]/declined/page.tsx — L38 invitation decline confirmation
// =============================================================================
// Simple thank-you page shown when a recipient clicks "Decline" on the
// invitation page. No database tracking — declined invitations are an
// off-platform signal for now (the host knows because the team never
// registers). Future work could add a decline-tracking table if hosts
// want to see who explicitly said no.
//
// The page reads the join code from the URL so we can still display the
// tournament name for context (if it resolves), but works even if the
// code is invalid.
// =============================================================================

import { createClient } from "@/lib/supabase-server";
import Link from "next/link";
import { normalizeJoinCode } from "@/lib/tournamentJoinCode";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function DeclinedPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const normalized = normalizeJoinCode(rawCode);

  // Best-effort tournament name lookup (public RPC; works without auth)
  const supabase = await createClient();
  let tournamentName: string | null = null;
  let hostOrgName: string | null = null;
  if (normalized) {
    const { data } = await supabase.rpc("get_public_tournament_info", {
      p_join_code: normalized,
    });
    if (Array.isArray(data) && data.length > 0) {
      tournamentName = data[0]?.name ?? null;
      hostOrgName = data[0]?.host_org_name ?? null;
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#041418",
        color: "#f7fbfb",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Slim header (matches the public invite page) */}
      <header
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: "Sora, system-ui, sans-serif",
              fontSize: 22,
              fontWeight: 800,
              color: "#ff755f",
              letterSpacing: -0.5,
            }}
          >
            earn²keep
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          padding: "60px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            maxWidth: 540,
            width: "100%",
            padding: 32,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: "#9fc3c7",
              letterSpacing: 1.5,
              marginBottom: 12,
            }}
          >
            INVITATION DECLINED
          </div>
          <h1
            style={{
              fontFamily: "Sora, system-ui, sans-serif",
              fontSize: 28,
              fontWeight: 800,
              margin: "0 0 16px 0",
              lineHeight: 1.2,
            }}
          >
            Thanks for letting us know.
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              opacity: 0.85,
              margin: "0 0 24px 0",
            }}
          >
            {tournamentName && hostOrgName ? (
              <>
                We won&apos;t enter your team in{" "}
                <strong style={{ color: "#f7fbfb" }}>{tournamentName}</strong>.
                If you change your mind, the invitation link still works — open
                your original email or contact{" "}
                <strong style={{ color: "#f7fbfb" }}>{hostOrgName}</strong> for
                the join code.
              </>
            ) : (
              <>
                We won&apos;t register your team for this tournament. If you
                change your mind, the original invitation link still works —
                or reach out to the host for the join code.
              </>
            )}
          </p>
          <p
            style={{
              fontSize: 13,
              opacity: 0.6,
              margin: "0 0 28px 0",
              lineHeight: 1.6,
            }}
          >
            No team is registered. No charge. Nothing more to do on your end.
          </p>
          <Link
            href="https://earn2keep.com"
            style={{
              display: "inline-block",
              padding: "12px 28px",
              background: "transparent",
              color: "#35d5df",
              border: "1px solid rgba(53, 213, 223, 0.4)",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Learn more about earn²keep →
          </Link>
        </div>
      </main>
    </div>
  );
}
