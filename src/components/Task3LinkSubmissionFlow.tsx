"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  taskId: number;
  teamId: string;
  memberName: string;
  collegeName: string;
  futurePlan: string;
  alreadySubmitted?: boolean;
}

export default function Task3LinkSubmissionFlow({
  taskId,
  teamId,
  memberName,
  collegeName,
  futurePlan,
  alreadySubmitted: initiallySubmitted = false,
}: Props) {
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(initiallySubmitted);

  function isValidUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");

    const trimmedLink = link.trim();

    if (!trimmedLink) {
      setSubmitError("Please enter a link URL.");
      return;
    }

    if (!isValidUrl(trimmedLink)) {
      setSubmitError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          member_name: memberName,
          college_name: collegeName,
          future_plan: futurePlan || undefined,
          answer: `Link submitted: ${trimmedLink}`,
          link: trimmedLink,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Submission failed. Please try again.");
        return;
      }

      setSubmitSuccess(true);
      setAlreadySubmitted(true);
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Already submitted state
  if (alreadySubmitted && !submitSuccess) {
    return (
      <div className="pro-card rounded-2xl p-8 sm:p-10 text-center bg-white border-emerald-200 shadow-xs">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ✓
        </div>
        <h3 className="font-heading font-bold text-2xl text-slate-900 mb-2">
          Task Already Submitted
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-8 font-display leading-relaxed">
          Your link has already been submitted for this task. Each member can submit once.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/#leaderboard" className="btn-secondary text-xs">
            Check Leaderboard Rank
          </Link>
          <Link href="/#tasks" className="btn-primary text-xs">
            Next Task →
          </Link>
        </div>
      </div>
    );
  }

  // Success screen
  if (submitSuccess) {
    return (
      <div className="pro-card rounded-2xl p-8 sm:p-10 text-center bg-white border-emerald-200 shadow-xs">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ✓
        </div>
        <h3 className="font-heading font-bold text-2xl text-slate-900 mb-2">
          Link Submission Received!
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-8 font-display leading-relaxed">
          Your link has been recorded successfully. The admin panel can now evaluate and award your points.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/#leaderboard" className="btn-secondary text-xs">
            Check Leaderboard Rank
          </Link>
          <Link href="/#tasks" className="btn-primary text-xs">
            Next Task →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pro-card rounded-2xl p-6 sm:p-8 bg-white">
      <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
        <span className="text-lg">🔗</span>
        <h3 className="font-heading font-bold text-lg text-slate-900">
          Submit Your Link
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
            Link URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            required
            placeholder="https://..."
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setSubmitError("");
            }}
            className="input-field text-sm font-mono"
          />
          <p className="text-[11px] text-slate-400 font-display mt-1.5">
            Enter a valid public URL (starting with https:// or http://).
          </p>
        </div>

        {/* Link Preview */}
        {link.trim() && isValidUrl(link.trim()) && (
          <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs">🔗</span>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-teal-800">
                Link Preview
              </span>
            </div>
            <a
              href={link.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-teal-700 hover:underline break-all"
            >
              {link.trim()}
            </a>
          </div>
        )}

        {submitError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
            {submitError}
          </div>
        )}

        <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto btn-primary text-xs py-3 px-8"
          >
            {submitting ? "Submitting Link..." : "Submit Task Link →"}
          </button>
          <Link
            href="/#tasks"
            className="w-full sm:w-auto btn-ghost text-xs py-3 px-6 text-center"
          >
            Save &amp; Return Later
          </Link>
        </div>
      </form>
    </div>
  );
}
