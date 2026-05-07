"use client";

import type { SubmissionStatus } from "@/lib/scoring";

interface SubmissionStatusBadgeProps {
  status: SubmissionStatus;
  size?: "sm" | "md";
}

export default function SubmissionStatusBadge({
  status,
  size = "md",
}: SubmissionStatusBadgeProps) {
  const cls = `submission-badge submission-badge-${status} submission-badge-${size}`;
  const label =
    status === "approved"
      ? "✓ Approved"
      : status === "rejected"
      ? "✕ Rejected"
      : "● Pending";
  return <span className={cls}>{label}</span>;
}
