"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Track {
  id: number;
  name: string;
  poster_url: string | null;
  display_order: number;
}

interface Props {
  taskId: number;
  teamId: string;
  memberName: string;
  collegeName: string;
  futurePlan: string;
  alreadySubmitted?: boolean;
}

export default function Task4TrackSelectionFlow({
  taskId,
  teamId,
  memberName,
  collegeName,
  futurePlan,
  alreadySubmitted: initiallySubmitted = false,
}: Props) {
  const [commonPosterUrl, setCommonPosterUrl] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [selectedTrackPosterUrl, setSelectedTrackPosterUrl] = useState<string | null>(null);
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(initiallySubmitted);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [posterRes, tracksRes] = await Promise.all([
          fetch(`/api/tasks/${taskId}/poster?type=common`),
          fetch(`/api/tasks/${taskId}/tracks`),
        ]);

        const posterData = await posterRes.json();
        if (posterData.poster_url) {
          setCommonPosterUrl(posterData.poster_url);
        }

        const tracksData = await tracksRes.json();
        if (tracksData.tracks && Array.isArray(tracksData.tracks)) {
          const sortedTracks = tracksData.tracks.sort((a: Track, b: Track) => a.display_order - b.display_order);
          setTracks(sortedTracks);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [taskId]);

  useEffect(() => {
    if (selectedTrackId) {
      const track = tracks.find(t => t.id === selectedTrackId);
      setSelectedTrackPosterUrl(track?.poster_url || null);
    } else {
      setSelectedTrackPosterUrl(null);
    }
  }, [selectedTrackId, tracks]);

  async function handleDownloadCommonPoster() {
    if (!commonPosterUrl) return;
    try {
      const res = await fetch(commonPosterUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tricity-common-poster.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download poster. Please try again.");
    }
  }

  async function handleDownloadTrackPoster() {
    if (!selectedTrackPosterUrl) return;
    try {
      const res = await fetch(selectedTrackPosterUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const track = tracks.find(t => t.id === selectedTrackId);
      const trackName = track?.name.replace(/[^a-zA-Z0-9]/g, "-") || "track";
      a.download = `tricity-${trackName}-poster.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download track poster. Please try again.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");

    const trimmedLinkedInUrl = linkedInUrl.trim();

    if (!selectedTrackId) {
      setSubmitError("Please select a track before submitting.");
      return;
    }

    const selectedTrack = tracks.find(t => t.id === selectedTrackId);
    if (!selectedTrack) {
      setSubmitError("Selected track not found.");
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
          answer: `Track selected: ${selectedTrack.name}`,
          link: trimmedLinkedInUrl || undefined,
          track_id: selectedTrackId,
          linkedin_url: trimmedLinkedInUrl,
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
          You have already completed and submitted this task. Each member can submit once.
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

  if (submitSuccess) {
    return (
      <div className="pro-card rounded-2xl p-8 sm:p-10 text-center bg-white border-emerald-200 shadow-xs">
        <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ✓
        </div>
        <h3 className="font-heading font-bold text-2xl text-slate-900 mb-2">
          Submission Received!
        </h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto mb-8 font-display leading-relaxed">
          Your track selection and LinkedIn URL have been recorded. The admin panel can now evaluate and award your points.
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

  if (loading) {
    return (
      <div className="pro-card rounded-2xl p-8 text-center bg-white">
        <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin mx-auto mb-3" />
        <span className="font-mono text-xs uppercase tracking-widest text-slate-500 font-semibold">
          Loading Task 4...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Common Poster Section */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            1
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">Common Poster</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 font-display leading-relaxed">
          Download the shared poster available to all participants.
        </p>
        {commonPosterUrl ? (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <img
                src={commonPosterUrl}
                alt="Common Poster Preview"
                className="w-full max-w-sm h-auto rounded-lg shadow-sm mx-auto block"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <p className="text-center text-[11px] text-slate-500 font-mono mt-2">Common Poster Preview</p>
            </div>
            <button
              type="button"
              onClick={handleDownloadCommonPoster}
              className="w-full sm:w-auto btn-primary text-xs py-3 px-8"
            >
              Download Common Poster (PNG)
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-mono text-center">
            Common poster not yet uploaded by admin.
          </div>
        )}
      </section>

      {/* Track Selection Section */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            2
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">Select Your Track</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 font-display leading-relaxed">
          Choose one track from the list below. You can download the track-specific poster after selection.
        </p>

        {tracks.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs font-mono text-center">
            No tracks configured yet. Please contact admin.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
              Choose a Track
            </label>
            <select
              value={selectedTrackId ? String(selectedTrackId) : ""}
              onChange={(e) => setSelectedTrackId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="input-field text-sm"
            >
              <option value="">— Select a track —</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Track Poster Download - only shows after track selection */}
        {selectedTrackId && selectedTrackPosterUrl && (
          <div className="mt-5 p-4 rounded-xl bg-teal-50 border border-teal-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">📋</span>
              <span className="font-heading font-bold text-sm text-teal-900">
                Track Poster: {tracks.find(t => t.id === selectedTrackId)?.name}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-white border border-teal-200 mb-3">
              <img
                src={selectedTrackPosterUrl}
                alt="Track Poster Preview"
                className="w-full max-w-sm h-auto rounded-md shadow-sm mx-auto block"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <p className="text-center text-[11px] text-teal-700 font-mono mt-2">Track Poster Preview</p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTrackPoster}
              className="w-full sm:w-auto btn-secondary text-xs py-2.5 px-6"
            >
              Download Track Poster (PNG)
            </button>
          </div>
        )}
      </section>

      {/* LinkedIn URL Section */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            3
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">LinkedIn Post URL</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 font-display leading-relaxed">
          Paste your LinkedIn post URL below. No format validation — any string is accepted.
        </p>
        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
            💼 LinkedIn Post URL
          </label>
          <input
            type="text"
            value={linkedInUrl}
            onChange={(e) => {
              setLinkedInUrl(e.target.value);
              setSubmitError("");
            }}
            placeholder="https://www.linkedin.com/posts/... or any text"
            className="input-field text-xs"
            disabled={alreadySubmitted}
          />
          <p className="text-[11px] text-slate-400 font-display mt-1.5">
            Paste your LinkedIn post link here. Any text is accepted — no validation.
          </p>
        </div>
      </section>

      {/* Submit Section */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        {submitError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono mb-4">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              type="submit"
              disabled={submitting || !selectedTrackId || alreadySubmitted}
              className="w-full sm:w-auto btn-primary text-xs py-3 px-8"
            >
              {submitting
                ? "Submitting..."
                : alreadySubmitted
                ? "Already Submitted"
                : !selectedTrackId
                ? "Select a track to enable submit"
                : "Submit Task 4 →"}
            </button>

            <Link
              href="/#tasks"
              className="w-full sm:w-auto btn-ghost text-xs py-3 px-6 text-center"
            >
              Return to Tasks
            </Link>
          </div>

          {!selectedTrackId && tracks.length > 0 && (
            <p className="text-[11px] text-slate-400 font-mono">
              Please select a track to unlock the submit button.
            </p>
          )}
        </form>
      </section>
    </div>
  );
}