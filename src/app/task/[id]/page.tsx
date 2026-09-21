"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Task1PosterFlow from "@/components/Task1PosterFlow";

const POSTER_TASK_ID = 1;

function readIdentityFromCookies() {
  if (typeof document === "undefined") {
    return { team_id: "", member_name: "", college_name: "" };
  }
  const cookies = document.cookie.split("; ").reduce((acc, c) => {
    const [key, ...val] = c.split("=");
    acc[key] = decodeURIComponent(val.join("="));
    return acc;
  }, {} as Record<string, string>);
  return {
    team_id: cookies.team_id || "",
    member_name: cookies.member_name || "",
    college_name: cookies.college_name || "",
  };
}

interface TaskData {
  id: number;
  title: string;
  description: string;
  rules?: string | null;
  linkedin_template?: string | null;
  instagram_template?: string | null;
}

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [mounted, setMounted] = useState(false);
  const [task, setTask] = useState<TaskData | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState({
    team_id: "",
    member_name: "",
    college_name: "",
  });

  // Submission form state
  const [answer, setAnswer] = useState("");
  const [link, setLink] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    const idInfo = readIdentityFromCookies();
    setIdentity(idInfo);

    if (!idInfo.team_id || !idInfo.member_name) {
      setError("Please start this task from the home page to record your team identity.");
      setLoading(false);
      return;
    }

    // Validate task access via the start endpoint
    fetch(`/api/tasks/${id}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: idInfo.team_id,
        member_name: idInfo.member_name,
        college_name: idInfo.college_name,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setTask(data.task);
          setAlreadySubmitted(data.already_submitted);
        }
      })
      .catch(() => setError("Failed to load task"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/tasks/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: identity.team_id,
          member_name: identity.member_name,
          college_name: identity.college_name,
          answer,
          link: link || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Submission failed");
        setSubmitting(false);
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

  if (!mounted || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin" />
          <span className="font-mono text-xs uppercase tracking-widest text-slate-500 font-semibold">
            Loading Challenge Workspace...
          </span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50 text-slate-900">
        <div className="pro-card rounded-2xl p-8 max-w-md w-full text-center bg-white shadow-md">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 mx-auto mb-5 flex items-center justify-center text-red-600 text-xl font-bold">
            ✕
          </div>
          <h2 className="font-heading font-bold text-xl text-slate-900 mb-2">
            Access Restricted
          </h2>
          <p className="text-sm text-slate-600 mb-6 font-display leading-relaxed">
            {error}
          </p>
          <Link href="/#tasks" className="btn-primary w-full text-xs">
            ← Return to Tasks
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/40 text-slate-900">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/#tasks"
            className="flex items-center gap-2 text-xs font-mono font-bold tracking-wider uppercase text-slate-600 hover:text-teal-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Challenges</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <div className="px-3 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-bold flex items-center gap-1.5 flex-wrap">
              <span>{identity.team_id}</span>
              <span className="text-teal-400">·</span>
              <span className="font-normal text-teal-700">{identity.member_name}</span>
              {identity.college_name && (
                <>
                  <span className="text-teal-400">·</span>
                  <span className="font-normal text-teal-600">{identity.college_name}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-10 w-full">
        {/* Task Header Card */}
        <div className="pro-card rounded-2xl p-6 sm:p-8 bg-white mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-bold">
              TASK #{task?.id}
            </span>
            <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Centle India Tri-City Sprint
            </span>
          </div>

          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-slate-900 mb-6">
            {task?.title}
          </h1>

          {/* Mission Brief */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-500 mb-2">
              <span>📋</span> Mission Brief
            </div>
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-display whitespace-pre-wrap">
              {task?.description}
            </p>
          </div>

          {/* Official Rules & Evaluation Guidelines */}
          {task?.rules && task.rules.trim() && (
            <div className="mt-5 rounded-xl border border-amber-300/80 bg-gradient-to-br from-amber-50/90 via-amber-50/50 to-orange-50/30 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-between gap-3 mb-3 border-b border-amber-200/70 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-white text-xs">
                    📜
                  </span>
                  <h3 className="font-heading font-bold text-sm sm:text-base text-amber-950">
                    Official Rules &amp; Submission Guidelines
                  </h3>
                </div>
                <span className="rounded-full bg-amber-100/90 px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-800 border border-amber-200">
                  Mandatory
                </span>
              </div>
              <div className="text-xs sm:text-sm text-amber-950 leading-relaxed font-display whitespace-pre-wrap pl-1">
                {task.rules}
              </div>
            </div>
          )}
        </div>

        {/* Task 1 — Share Your Registration Poster (special flow) */}
        {task && task.id === POSTER_TASK_ID ? (
          <Task1PosterFlow
            teamId={identity.team_id}
            memberName={identity.member_name}
            collegeName={identity.college_name}
            rules={task.rules}
            customTemplate={task.linkedin_template}
            customInstagramTemplate={task.instagram_template}
          />
        ) : (
          /* Submission Section */
          alreadySubmitted ? (
          <div className="pro-card rounded-2xl p-8 sm:p-10 text-center bg-white border-emerald-200 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ✓
            </div>
            <h3 className="font-heading font-bold text-2xl text-slate-900 mb-2">
              {submitSuccess ? "Challenge Submission Received!" : "Task Already Submitted"}
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-8 font-display leading-relaxed">
              {submitSuccess
                ? "Your response has been verified and registered in the database. The admin panel can now evaluate and award your points."
                : "Your team has already provided an answer for this task. Each member can submit once per challenge."}
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
        ) : (
          <div className="pro-card rounded-2xl p-6 sm:p-8 bg-white">
            <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
              <span className="text-lg">✍️</span>
              <h3 className="font-heading font-bold text-lg text-slate-900">
                Submit Your Solution
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-mono font-semibold uppercase text-slate-700">
                    Your Answer / Solution Explanation <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    {answer.length} characters
                  </span>
                </div>
                <textarea
                  rows={6}
                  required
                  placeholder="Detail your solution, steps taken, decryption key, or logic used..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="input-field text-sm font-display resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
                  Project Link / GitHub Repo / Demo URL <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  placeholder="https://github.com/..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="input-field text-xs"
                />
                <p className="text-[11px] text-slate-400 font-display mt-1.5">
                  Provide a live demo, repository link, or cloud file link if applicable.
                </p>
              </div>

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
                  {submitting ? "Uploading Submission..." : "Submit Task Solution →"}
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
          )
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs font-mono text-slate-400">
        Tri-City Hackathon Workspace · Warangal · Hanamkonda · Kazipet
      </footer>
    </div>
  );
}
