"use client";

import { useEffect, useState, useMemo } from "react";

export interface JuryMentorAdminEntry {
  id: string;
  role: "jury" | "mentor";
  name: string;
  designation: string;
  original_photo_url: string;
  poster_url: string;
  identifier: string;
  created_at: string;
  updated_at: string;
}

export default function JuryMentorsAdminSection() {
  const [entries, setEntries] = useState<JuryMentorAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "jury" | "mentor">("all");
  const [search, setSearch] = useState("");
  const [previewPosterUrl, setPreviewPosterUrl] = useState<string | null>(null);
  const [previewPosterTitle, setPreviewPosterTitle] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<JuryMentorAdminEntry | null>(null);

  async function fetchEntries() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/jury-mentors");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load entries");
      }
      setEntries(data.entries || []);
    } catch (err: any) {
      setError(err.message || "Failed to fetch jury & mentor entries");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/jury-mentors?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Delete failed");
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setConfirmDeleteEntry(null);
    } catch (err: any) {
      alert(err.message || "Could not delete entry");
    } finally {
      setDeletingId(null);
    }
  }

  function handleDownload(entry: JuryMentorAdminEntry) {
    if (!entry.poster_url) return;
    const a = document.createElement("a");
    a.href = entry.poster_url;
    const safeRole = entry.role;
    const safeName = entry.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    a.download = `tricity_${safeRole}_${safeName}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = e.name.toLowerCase().includes(q);
        const matchDesig = e.designation.toLowerCase().includes(q);
        const matchId = e.identifier.toLowerCase().includes(q);
        if (!matchName && !matchDesig && !matchId) return false;
      }
      return true;
    });
  }, [entries, roleFilter, search]);

  const juryCount = entries.filter((e) => e.role === "jury").length;
  const mentorCount = entries.filter((e) => e.role === "mentor").length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Header & Stats ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2">
            <span>⚖️💡</span>
            <span>Jury &amp; Mentors Spotlight Directory</span>
          </h2>
          <p className="text-xs text-slate-500 font-display">
            Manage submissions, review generated spotlight posters, and download high-resolution graphics.
          </p>
        </div>

        <button
          onClick={fetchEntries}
          className="btn-secondary text-xs py-2 px-4 self-start md:self-auto cursor-pointer flex items-center gap-1.5"
        >
          <span>↻</span> Refresh List
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Total Submissions</div>
          <div className="font-heading font-bold text-2xl text-slate-900 mt-1">{entries.length}</div>
        </div>
        <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 shadow-2xs">
          <div className="text-[11px] font-mono text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
            <span>⚖️</span> Jury Members
          </div>
          <div className="font-heading font-bold text-2xl text-amber-950 mt-1">{juryCount}</div>
        </div>
        <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 shadow-2xs">
          <div className="text-[11px] font-mono text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <span>💡</span> Mentors
          </div>
          <div className="font-heading font-bold text-2xl text-emerald-950 mt-1">{mentorCount}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setRoleFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
              roleFilter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({entries.length})
          </button>
          <button
            onClick={() => setRoleFilter("jury")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
              roleFilter === "jury"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            Jury ({juryCount})
          </button>
          <button
            onClick={() => setRoleFilter("mentor")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
              roleFilter === "mentor"
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            Mentors ({mentorCount})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by name, org, or id..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field text-xs bg-slate-50"
          />
        </div>
      </div>

      {/* Table & List */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <div className="w-8 h-8 rounded-full border-2 border-teal-200 border-t-teal-700 animate-spin mx-auto mb-3" />
          <span className="font-mono text-xs text-slate-400">Loading entries...</span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
          ⚠️ {error}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300">
          <div className="text-3xl mb-2">📋</div>
          <h4 className="font-heading font-bold text-base text-slate-800">No Entries Found</h4>
          <p className="text-xs text-slate-500 font-display mt-1">
            {search || roleFilter !== "all"
              ? "No records matched your search filters."
              : "No Jury or Mentor submissions have been recorded yet."}
          </p>
        </div>
      ) : (
        <div className="pro-card rounded-xl overflow-hidden bg-white border border-slate-200 shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Designation / Org</th>
                  <th className="py-3 px-4">Photo</th>
                  <th className="py-3 px-4">Generated Poster</th>
                  <th className="py-3 px-4">Submitted</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-display">
                {filteredEntries.map((entry) => {
                  const isJury = entry.role === "jury";
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                            isJury
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          }`}
                        >
                          <span>{isJury ? "⚖️" : "💡"}</span>
                          <span>{entry.role}</span>
                        </span>
                      </td>

                      {/* Name */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                        {entry.name}
                      </td>

                      {/* Designation */}
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={entry.designation}>
                        {entry.designation}
                      </td>

                      {/* Original Photo */}
                      <td className="py-3.5 px-4">
                        {entry.original_photo_url ? (
                          <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 shadow-2xs bg-slate-100">
                            <img
                              src={entry.original_photo_url}
                              alt={entry.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">—</span>
                        )}
                      </td>

                      {/* Generated Poster Thumbnail & Preview */}
                      <td className="py-3.5 px-4">
                        {entry.poster_url ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewPosterUrl(entry.poster_url);
                              setPreviewPosterTitle(`${entry.name} (${entry.role.toUpperCase()})`);
                            }}
                            className="group flex items-center gap-2 cursor-pointer text-left"
                            title="Click to preview full-size poster"
                          >
                            <div className="w-9 h-11 rounded border border-slate-300 overflow-hidden shadow-2xs group-hover:border-teal-500 transition-colors bg-slate-100">
                              <img
                                src={entry.poster_url}
                                alt="Poster thumb"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="font-mono text-[11px] text-teal-700 underline group-hover:text-teal-900">
                              View Poster
                            </span>
                          </button>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">—</span>
                        )}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(entry)}
                            className="btn-primary text-[11px] py-1.5 px-3 inline-flex items-center gap-1 cursor-pointer"
                            title="Download poster PNG"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>PNG</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmDeleteEntry(entry)}
                            className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
                            title="Delete entry"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── POSTER PREVIEW MODAL ── */}
      {previewPosterUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-heading font-bold text-sm text-slate-900 truncate pr-4">
                {previewPosterTitle}
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPosterUrl(null)}
                className="text-slate-400 hover:text-slate-700 font-mono text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative my-3 flex-1 overflow-auto rounded-xl bg-slate-100 p-2 flex items-center justify-center">
              <img
                src={previewPosterUrl}
                alt="Full size poster"
                className="max-h-[65vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-slate-400">1080 × 1350 px</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewPosterUrl}
                  download="tricity_poster.png"
                  className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download High-Res</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewPosterUrl(null)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE MODAL ── */}
      {confirmDeleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center text-xl mb-4">
              🗑️
            </div>
            <h3 className="font-heading font-bold text-lg text-slate-900 mb-1">
              Delete Entry?
            </h3>
            <p className="text-xs text-slate-600 font-display leading-relaxed mb-6">
              Are you sure you want to delete the entry for <strong>{confirmDeleteEntry.name}</strong> ({confirmDeleteEntry.role})? This cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteEntry(null)}
                className="btn-secondary text-xs py-2 px-4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId === confirmDeleteEntry.id}
                onClick={() => handleDelete(confirmDeleteEntry.id)}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-bold transition-colors cursor-pointer"
              >
                {deletingId === confirmDeleteEntry.id ? "Deleting..." : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
