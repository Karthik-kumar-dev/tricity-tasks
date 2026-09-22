"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface TaskLinkItem {
  id: string;
  label: string;
  url: string;
}

interface Props {
  taskId: number;
  teamId: string;
  memberName: string;
  collegeName: string;
  futurePlan: string;
  links: TaskLinkItem[];
  initialOpenedIds?: string[];
  alreadySubmitted?: boolean;
}

export default function Task2MultiLinkFlow({
  taskId,
  teamId,
  memberName,
  collegeName,
  futurePlan,
  links,
  initialOpenedIds = [],
  alreadySubmitted: initiallySubmitted = false,
}: Props) {
  const [openedIds, setOpenedIds] = useState<Set<string>>(
    () => new Set(initialOpenedIds)
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(initiallySubmitted);
  const [clickingId, setClickingId] = useState<string | null>(null);

  const totalLinks = links.length;
  const openedCount = openedIds.size;
  const allOpened = totalLinks > 0 && openedCount >= totalLinks;
  const progressPct = totalLinks > 0 ? (openedCount / totalLinks) * 100 : 0;

  // Fetch opened link IDs on mount (in case the start API missed local clicks)
  const fetchOpenedLinks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/tasks/${taskId}/links?team_id=${encodeURIComponent(
          teamId
        )}&member_name=${encodeURIComponent(memberName)}`
      );
      const data = await res.json();
      if (data.opened_link_ids && Array.isArray(data.opened_link_ids)) {
        setOpenedIds((prev) => {
          const next = new Set(prev);
          for (const id of data.opened_link_ids) next.add(id);
          return next;
        });
      }
    } catch {
      // ignore — we already have initialOpenedIds
    }
  }, [taskId, teamId, memberName]);

  useEffect(() => {
    fetchOpenedLinks();
  }, [fetchOpenedLinks]);

  async function handleOpenLink(link: TaskLinkItem) {
    if (openedIds.has(link.id) || alreadySubmitted) return;

    setClickingId(link.id);

    // Open the link in a new tab immediately
    window.open(link.url, "_blank", "noopener,noreferrer");

    // Record the click server-side
    try {
      const res = await fetch(`/api/tasks/${taskId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          member_name: memberName,
          link_id: link.id,
        }),
      });
      const data = await res.json();
      if (data.opened_link_ids) {
        setOpenedIds(new Set(data.opened_link_ids));
      } else {
        setOpenedIds((prev) => new Set([...prev, link.id]));
      }
    } catch {
      // Even on network error, lock the button locally
      setOpenedIds((prev) => new Set([...prev, link.id]));
    } finally {
      setClickingId(null);
    }
  }

  async function handleSubmit() {
    if (!allOpened || submitting || alreadySubmitted) return;
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          member_name: memberName,
          college_name: collegeName,
          future_plan: futurePlan || undefined,
          answer: `All ${totalLinks} links opened and verified.`,
          link: "",
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
          You have already completed and submitted this multi-link challenge. Each member can submit once.
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
          Challenge Submission Received!
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-8 font-display leading-relaxed">
          You opened all {totalLinks} links and your submission has been recorded. The admin panel can now evaluate and award your points.
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
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔗</span>
            <h3 className="font-heading font-bold text-lg text-slate-900">
              Multi-Link Challenge
            </h3>
          </div>
          <span className="px-3 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-bold">
            {openedCount} / {totalLinks} opened
          </span>
        </div>
        <p className="text-xs text-slate-500 font-display leading-relaxed mb-4">
          Click each link below to open it in a new tab. Each button will permanently lock once clicked. After opening all links, the Submit button will become available.
        </p>

        {/* Progress Bar */}
        <div className="w-full h-2.5 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPct}%`,
              background: allOpened
                ? "linear-gradient(90deg, #059669, #10b981)"
                : "linear-gradient(90deg, #0f766e, #14b8a6)",
            }}
          />
        </div>
      </div>

      {/* Links List */}
      <div className="space-y-3">
        {links.map((link, index) => {
          const isOpened = openedIds.has(link.id);
          const isClicking = clickingId === link.id;

          return (
            <div
              key={link.id}
              className={`pro-card rounded-xl p-4 sm:p-5 bg-white transition-all duration-300 ${
                isOpened
                  ? "border-emerald-200 bg-emerald-50/30"
                  : "border-slate-200 hover:border-teal-300"
              }`}
              style={isOpened ? { transform: "none" } : {}}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Number badge */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                      isOpened
                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {isOpened ? "✓" : index + 1}
                  </div>

                  {/* Label */}
                  <div className="min-w-0">
                    <h4
                      className={`font-heading font-bold text-sm truncate ${
                        isOpened ? "text-emerald-800" : "text-slate-900"
                      }`}
                    >
                      {link.label}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                      {link.url}
                    </p>
                  </div>
                </div>

                {/* Action Button */}
                <button
                  type="button"
                  onClick={() => handleOpenLink(link)}
                  disabled={isOpened || isClicking}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    isOpened
                      ? "bg-emerald-100 border border-emerald-200 text-emerald-700 cursor-not-allowed opacity-80"
                      : isClicking
                      ? "bg-teal-100 border border-teal-300 text-teal-700 cursor-wait"
                      : "bg-slate-900 text-white hover:bg-teal-700 hover:shadow-md active:scale-[0.97]"
                  }`}
                >
                  {isOpened ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Opened</span>
                    </>
                  ) : isClicking ? (
                    <>
                      <div className="w-3 h-3 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                      <span>Opening...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <span>Open Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit Section */}
      <div className="pro-card rounded-2xl p-6 bg-white">
        {submitError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono mb-4">
            {submitError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allOpened || submitting}
            className="w-full sm:w-auto btn-primary text-xs py-3 px-8"
          >
            {submitting
              ? "Submitting Challenge..."
              : allOpened
              ? "Submit Multi-Link Challenge →"
              : `Open all ${totalLinks} links to unlock submit`}
          </button>

          <Link
            href="/#tasks"
            className="w-full sm:w-auto btn-ghost text-xs py-3 px-6 text-center"
          >
            Return to Tasks
          </Link>
        </div>

        {!allOpened && totalLinks > 0 && (
          <p className="text-[11px] text-slate-400 font-mono mt-3">
            {totalLinks - openedCount} link{totalLinks - openedCount !== 1 ? "s" : ""} remaining
          </p>
        )}
      </div>
    </div>
  );
}
