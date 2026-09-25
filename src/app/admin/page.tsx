"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { MAX_SCORE, TASK_POINTS, FUTURE_PLAN_OPTIONS } from "@/lib/constants";

export interface TaskLinkItem {
  id: string;
  label: string;
  url: string;
}

interface Task {
  id: number;
  title: string;
  description?: string;
  is_active: boolean;
  rules?: string | null;
  linkedin_template?: string | null;
  instagram_template?: string | null;
  poster_template_url?: string | null;
  links?: TaskLinkItem[];
}

interface Team {
  team_id: string;
  member_count: number;
  submission_count: number;
  avg_score: number | null;
  total_score: number;
  member_names?: string[];
  colleges?: string[];
}

interface Submission {
  id: number;
  team_id?: string;
  member_name: string;
  college_name?: string | null;
  future_plan?: string | null;
  task_id: number;
  task_title: string;
  answer: string;
  link: string | null;
  score: number | null;
  created_at: string;
}

// RFC 4180 CSV parser for client preview
function parseCsvClient(csvText: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((c) => c.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const rawHeaders = lines[0];
  const records: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const record: Record<string, string> = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      record[rawHeaders[c]] = row[c] !== undefined ? row[c].trim() : "";
    }
    records.push(record);
  }

  return { headers: rawHeaders, records };
}

interface Track {
  id: number;
  name: string;
  poster_url: string | null;
  display_order: number;
}

function Task4AdminConfig({ taskId }: { taskId: number }) {
  const [commonPosterUrl, setCommonPosterUrl] = useState<string>("");
  const [commonPosterFile, setCommonPosterFile] = useState<File | null>(null);
  const [commonPosterPreview, setCommonPosterPreview] = useState<string>("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCommonPoster, setSavingCommonPoster] = useState(false);
  const [commonPosterMsg, setCommonPosterMsg] = useState("");
  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrackName, setNewTrackName] = useState("");
  const [newTrackPosterFile, setNewTrackPosterFile] = useState<File | null>(null);
  const [newTrackPosterPreview, setNewTrackPosterPreview] = useState<string>("");
  const [trackError, setTrackError] = useState("");
  const [trackSuccess, setTrackSuccess] = useState("");
  const [editingTrackPosterId, setEditingTrackPosterId] = useState<number | null>(null);
  const [editingTrackPosterFile, setEditingTrackPosterFile] = useState<File | null>(null);
  const [editingTrackPosterPreview, setEditingTrackPosterPreview] = useState<string>("");

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
          setTracks(tracksData.tracks.sort((a: Track, b: Track) => a.display_order - b.display_order));
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [taskId]);

  async function handleSaveCommonPoster() {
    const fileToUpload = commonPosterFile;
    const urlToSave = commonPosterUrl.trim();

    if (!fileToUpload && !urlToSave) {
      setCommonPosterMsg("Please select a file or enter a poster URL");
      return;
    }
    setSavingCommonPoster(true);
    setCommonPosterMsg("");
    try {
      let finalUrl = urlToSave;
      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("folder", `task-${taskId}/common`);

        const uploadRes = await fetch("/api/admin/storage/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setCommonPosterMsg(uploadData.error || "Failed to upload file");
          return;
        }
        finalUrl = uploadData.url;
      }

      const res = await fetch(`/api/tasks/${taskId}/poster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poster_url: finalUrl, is_common: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommonPosterMsg(data.error || "Failed to save");
        return;
      }
      setCommonPosterUrl(finalUrl);
      setCommonPosterFile(null);
      setCommonPosterPreview("");
      setCommonPosterMsg("✓ Common poster saved successfully!");
    } catch {
      setCommonPosterMsg("Network error. Please try again.");
    } finally {
      setSavingCommonPoster(false);
    }
  }

  async function handleAddTrack() {
    if (!newTrackName.trim()) {
      setTrackError("Track name is required");
      return;
    }
    setAddingTrack(true);
    setTrackError("");
    setTrackSuccess("");
    try {
      let posterUrl = "";
      if (newTrackPosterFile) {
        const formData = new FormData();
        formData.append("file", newTrackPosterFile);
        formData.append("folder", `task-${taskId}/tracks`);

        const uploadRes = await fetch("/api/admin/storage/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setTrackError(uploadData.error || "Failed to upload track poster");
          return;
        }
        posterUrl = uploadData.url;
      }

      const res = await fetch(`/api/tasks/${taskId}/tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTrackName.trim(),
          poster_url: posterUrl || null,
          display_order: tracks.length,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTrackError(data.error || "Failed to add track");
        return;
      }
      setTracks((prev) => [...prev, data.track].sort((a, b) => a.display_order - b.display_order));
      setNewTrackName("");
      setNewTrackPosterFile(null);
      setNewTrackPosterPreview("");
      setTrackSuccess("✓ Track added successfully!");
    } catch {
      setTrackError("Network error. Please try again.");
    } finally {
      setAddingTrack(false);
    }
  }

  async function handleUpdateTrack(track: Track, updates: Partial<Track>) {
    try {
      const res = await fetch(`/api/tasks/${taskId}/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update track");
        return;
      }
      setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, ...data.track } : t)).sort((a, b) => a.display_order - b.display_order));
    } catch {
      alert("Network error. Please try again.");
    }
  }

  async function handleDeleteTrack(trackId: number) {
    if (!confirm("Are you sure you want to delete this track?")) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/tracks/${trackId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete track");
        return;
      }
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch {
      alert("Network error. Please try again.");
    }
  }

  async function handleUpdateTrackPoster(track: Track) {
    if (editingTrackPosterId === track.id) {
      // Save the uploaded file
      if (!editingTrackPosterFile) {
        alert("Please select a file first");
        return;
      }
      const formData = new FormData();
      formData.append("file", editingTrackPosterFile);
      formData.append("folder", `task-${taskId}/tracks`);

      const uploadRes = await fetch("/api/admin/storage/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        alert(uploadData.error || "Failed to upload track poster");
        return;
      }
      await handleUpdateTrack(track, { poster_url: uploadData.url });
      setEditingTrackPosterId(null);
      setEditingTrackPosterFile(null);
      setEditingTrackPosterPreview("");
    } else {
      // Show file input
      setEditingTrackPosterId(track.id);
      setEditingTrackPosterFile(null);
      setEditingTrackPosterPreview("");
    }
  }

  async function handleReorderTrack(track: Track, direction: -1 | 1) {
    const idx = tracks.findIndex((t) => t.id === track.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= tracks.length) return;
    const newTracks = [...tracks];
    const [moved] = newTracks.splice(idx, 1);
    newTracks.splice(targetIdx, 0, moved);
    const updatedTracks = newTracks.map((t, i) => ({ ...t, display_order: i }));
    setTracks(updatedTracks);
    // Persist new order
    for (const t of updatedTracks) {
      if (t.display_order !== tracks.find((ot) => ot.id === t.id)?.display_order) {
        await handleUpdateTrack(t, { display_order: t.display_order });
      }
    }
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin mx-auto mb-2" />
        <span className="font-mono text-xs uppercase tracking-widest text-slate-500 font-semibold">
          Loading Task 4 Config...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Common Poster Manager */}
      <div className="p-5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <h5 className="font-heading font-bold text-sm text-blue-900">Common Poster (Shared by All Participants)</h5>
        </div>
        <p className="text-xs text-blue-700 font-display">
          This poster is visible to everyone and can be downloaded without selecting a track.
        </p>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1">
                Upload Poster Image (PNG/JPG/WebP, max 10MB)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setCommonPosterFile(file);
                    setCommonPosterPreview(URL.createObjectURL(file));
                  }
                }}
                className="input-field text-xs bg-white border-blue-200"
              />
            </div>
          </div>
          {commonPosterPreview && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <img src={commonPosterPreview} alt="Preview" className="w-16 h-16 object-cover rounded" />
              <span className="text-xs font-mono text-blue-700">Preview ready</span>
            </div>
          )}
          {commonPosterUrl && !commonPosterPreview && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <img src={commonPosterUrl} alt="Current" className="w-16 h-16 object-cover rounded" />
              <a href={commonPosterUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-blue-700 hover:underline">
                Current Poster
              </a>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={commonPosterUrl}
              onChange={(e) => setCommonPosterUrl(e.target.value)}
              placeholder="Or enter poster URL manually"
              className="input-field text-xs flex-1 font-mono bg-white border-blue-200"
            />
            <button
              type="button"
              onClick={handleSaveCommonPoster}
              disabled={savingCommonPoster}
              className="btn-primary text-xs px-4 py-2 whitespace-nowrap shrink-0"
            >
              {savingCommonPoster ? "Saving..." : "Save Common Poster"}
            </button>
          </div>
        {commonPosterMsg && (
          <div className={`text-xs font-mono ${commonPosterMsg.startsWith("✓") ? "text-emerald-700" : "text-red-700"}`}>
            {commonPosterMsg}
          </div>
        )}
      </div>

      {/* Tracks Manager */}
      <div className="p-5 rounded-xl bg-purple-50/60 border border-purple-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <h5 className="font-heading font-bold text-sm text-purple-900">Track Manager ({tracks.length})</h5>
          </div>
          <p className="text-[11px] font-mono text-purple-600">Add, edit, reorder, or remove tracks. Each track can have its own poster.</p>
        </div>

        {/* Add Track Form */}
        <div className="p-4 rounded-lg bg-white border border-purple-200 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1">
                Track Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={newTrackName}
                onChange={(e) => setNewTrackName(e.target.value)}
                placeholder="e.g. AI/ML, Web Dev, Mobile"
                className="input-field text-xs bg-slate-50/50"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1">
                Poster Image (Optional)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setNewTrackPosterFile(file);
                    setNewTrackPosterPreview(URL.createObjectURL(file));
                  }
                }}
                className="input-field text-xs bg-slate-50/50"
              />
              {newTrackPosterPreview && (
                <div className="mt-1 flex items-center gap-2">
                  <img src={newTrackPosterPreview} alt="Preview" className="w-10 h-10 object-cover rounded" />
                  <span className="text-xs font-mono text-slate-500">Ready to upload</span>
                </div>
              )}
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddTrack}
                disabled={addingTrack}
                className="btn-secondary text-xs px-4 py-2 w-full"
              >
                {addingTrack ? "Adding..." : "+ Add Track"}
              </button>
            </div>
          </div>
          {trackError && <div className="text-xs font-mono text-red-700">{trackError}</div>}
          {trackSuccess && <div className="text-xs font-mono text-emerald-700">{trackSuccess}</div>}
        </div>

        {/* Tracks List */}
        {tracks.length === 0 ? (
          <>
            <div className="p-6 rounded-lg bg-white border border-dashed border-purple-300 text-center">
              <p className="text-xs text-slate-500 font-mono mb-3">
                No tracks configured yet. Add the first track above.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-3">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className="p-4 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-3"
                >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-purple-100 text-purple-800 font-mono text-xs font-bold flex items-center justify-center">
                      #{track.display_order + 1}
                    </span>
                    <span className="font-heading font-bold text-sm text-slate-900">{track.name}</span>
                    {track.poster_url && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-mono font-semibold">
                        📎 Has Poster
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={track.display_order === 0}
                      onClick={() => handleReorderTrack(track, -1)}
                      className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center text-xs text-slate-600 cursor-pointer"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={track.display_order === tracks.length - 1}
                      onClick={() => handleReorderTrack(track, 1)}
                      className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center text-xs text-slate-600 cursor-pointer"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTrackPoster(track)}
                      className="w-7 h-7 rounded border border-purple-200 hover:bg-purple-50 text-purple-700 flex items-center justify-center text-xs cursor-pointer"
                      title={track.poster_url ? "Change Track Poster" : "Add Track Poster"}
                    >
                      📎
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTrack(track.id)}
                      className="w-7 h-7 rounded border border-red-200 hover:bg-red-50 text-red-600 flex items-center justify-center text-xs cursor-pointer ml-1"
                      title="Remove this track"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {editingTrackPosterId === track.id ? (
                  <div className="flex flex-col sm:flex-row gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditingTrackPosterFile(file);
                          setEditingTrackPosterPreview(URL.createObjectURL(file));
                        }
                      }}
                      className="input-field text-xs flex-1"
                    />
                    {editingTrackPosterPreview && (
                      <img src={editingTrackPosterPreview} alt="Preview" className="w-12 h-12 object-cover rounded" />
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateTrackPoster(track)}
                        disabled={!editingTrackPosterFile}
                        className="btn-primary text-xs px-3 py-1"
                      >
                        Save Poster
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTrackPosterId(null);
                          setEditingTrackPosterFile(null);
                          setEditingTrackPosterPreview("");
                        }}
                        className="btn-secondary text-xs px-3 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : track.poster_url ? (
                  <div className="flex items-center gap-2">
                    <img src={track.poster_url} alt="Poster" className="w-12 h-12 object-cover rounded border border-purple-200" />
                    <a
                      href={track.poster_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-purple-700 hover:underline truncate max-w-[200px]"
                    >
                      View Poster
                    </a>
                  </div>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400">No poster uploaded</span>
                )}
              </div>
            ))}
              </div>
            </>
          )}
</div>
      </div>
    </div>
  );
}

interface Task5AdminConfigProps {
  taskId: number;
  linkedinTemplate: string;
  setLinkedinTemplate: (v: string) => void;
  instagramTemplate: string;
  setInstagramTemplate: (v: string) => void;
  posterTemplateUrl: string;
}

function Task5AdminConfig({
  taskId,
  linkedinTemplate,
  setLinkedinTemplate,
  instagramTemplate,
  setInstagramTemplate,
  posterTemplateUrl: initialPosterTemplateUrl,
}: Task5AdminConfigProps) {
  const [posterTemplateUrl, setPosterTemplateUrl] = useState<string>(initialPosterTemplateUrl);
  const [posterTemplateFile, setPosterTemplateFile] = useState<File | null>(null);
  const [posterTemplatePreview, setPosterTemplatePreview] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateMsg, setTemplateMsg] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tasks/${taskId}/poster-template`);
        const data = await res.json();
        if (data.poster_template_url) {
          setPosterTemplateUrl(data.poster_template_url);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [taskId]);

  async function handleSaveTemplate() {
    const fileToUpload = posterTemplateFile;
    const urlToSave = posterTemplateUrl.trim();

    if (!fileToUpload && !urlToSave) {
      setTemplateMsg("Please select a file or enter a poster template URL");
      return;
    }
    setSavingTemplate(true);
    setTemplateMsg("");
    try {
      let finalUrl = urlToSave;
      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("folder", `task-${taskId}/template`);

        const uploadRes = await fetch("/api/admin/storage/upload", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          setTemplateMsg(uploadData.error || "Failed to upload file");
          return;
        }
        finalUrl = uploadData.url;
      }

      const res = await fetch(`/api/tasks/${taskId}/poster-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poster_template_url: finalUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTemplateMsg(data.error || "Failed to save");
        return;
      }
      setPosterTemplateUrl(finalUrl);
      setPosterTemplateFile(null);
      setPosterTemplatePreview("");
      setTemplateMsg("✓ Poster template saved successfully!");
    } catch {
      setTemplateMsg("Network error. Please try again.");
    } finally {
      setSavingTemplate(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
        <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin mx-auto mb-2" />
        <span className="font-mono text-xs uppercase tracking-widest text-slate-500 font-semibold">
          Loading Task 5 Config...
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Poster Template Manager */}
      <div className="p-5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🖼️</span>
          <h5 className="font-heading font-bold text-sm text-indigo-900">Poster Template (Admin Upload)</h5>
        </div>
        <p className="text-xs text-indigo-700 font-display">
          This template is used for the photo overlay. Name and college text positions are fixed in the template design.
        </p>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1">
                Upload Poster Template Image (PNG/JPG/WebP, max 10MB)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setPosterTemplateFile(file);
                    setPosterTemplatePreview(URL.createObjectURL(file));
                  }
                }}
                className="input-field text-xs bg-white border-indigo-200"
              />
            </div>
          </div>
          {posterTemplatePreview && (
            <div className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
              <img src={posterTemplatePreview} alt="Preview" className="w-16 h-16 object-cover rounded" />
              <span className="text-xs font-mono text-indigo-700">Preview ready</span>
            </div>
          )}
          {posterTemplateUrl && !posterTemplatePreview && (
            <div className="flex items-center gap-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg">
              <img src={posterTemplateUrl} alt="Current" className="w-16 h-16 object-cover rounded" />
              <a href={posterTemplateUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-indigo-700 hover:underline">
                Current Template
              </a>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={posterTemplateUrl}
              onChange={(e) => setPosterTemplateUrl(e.target.value)}
              placeholder="Or enter poster template URL manually"
              className="input-field text-xs flex-1 font-mono bg-white border-indigo-200"
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={savingTemplate}
              className="btn-primary text-xs px-4 py-2 whitespace-nowrap shrink-0"
            >
              {savingTemplate ? "Saving..." : "Save Poster Template"}
            </button>
          </div>
        </div>
        {templateMsg && (
          <div className={`text-xs font-mono ${templateMsg.startsWith("✓") ? "text-emerald-700" : "text-red-700"}`}>
            {templateMsg}
          </div>
        )}
      </div>

      {/* LinkedIn Caption Template Editor */}
      <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-mono font-semibold uppercase text-blue-900">
            💼 LinkedIn Caption Template
          </label>
          <span className="text-[11px] font-mono text-blue-600 font-semibold">
            Placeholders: &#123;name&#125; & &#123;college&#125;
          </span>
        </div>
        <textarea
          rows={6}
          className="input-field text-xs sm:text-sm font-mono leading-relaxed bg-white border-blue-200"
          value={linkedinTemplate}
          onChange={(e) => setLinkedinTemplate(e.target.value)}
          placeholder="I am thrilled to announce that I've joined the Tri-City Hackathon 2026! Name: {name}, College: {college}..."
        />
        <p className="text-[11px] text-blue-700 mt-1.5 font-display">
          When participants click &ldquo;Copy LinkedIn Caption&rdquo; in Task 5, &#123;name&#125; will automatically be replaced with their title-cased name and &#123;college&#125; with their institution.
        </p>
      </div>

      {/* Instagram Caption Template Editor */}
      <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200">
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-mono font-semibold uppercase text-rose-900">
            📸 Instagram Caption Template
          </label>
          <span className="text-[11px] font-mono text-rose-600 font-semibold">
            Placeholders: &#123;name&#125; & &#123;college&#125;
          </span>
        </div>
        <textarea
          rows={6}
          className="input-field text-xs sm:text-sm font-mono leading-relaxed bg-white border-rose-200"
          value={instagramTemplate}
          onChange={(e) => setInstagramTemplate(e.target.value)}
          placeholder="Registered for the TRI-CITY AI HACKATHON 2026! Name: {name}, College: {college}..."
        />
        <p className="text-[11px] text-rose-700 mt-1.5 font-display">
          When participants click &ldquo;Copy Instagram Caption&rdquo; in Task 5, &#123;name&#125; will automatically be replaced with their title-cased name and &#123;college&#125; with their institution.
        </p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [togglingTask, setTogglingTask] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"tasks" | "teams" | "registrations">("tasks");

  // Registrations CSV upload state
  const [regFile, setRegFile] = useState<File | null>(null);
  const [regParsing, setRegParsing] = useState(false);
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [regPreview, setRegPreview] = useState<{
    headers: string[];
    validRows: Array<{ registration_id: string; team_name: string; role: string; member_name: string }>;
    teamCount: number;
    skippedCount: number;
    totalParsedRows: number;
  } | null>(null);
  const [confirmReplaceModal, setConfirmReplaceModal] = useState(false);
  const [uploadingReg, setUploadingReg] = useState(false);
  const [currentRegStats, setCurrentRegStats] = useState<{ teamCount: number } | null>(null);

  // Add User form state
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [addUserError, setAddUserError] = useState("");
  const [newRegId, setNewRegId] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newMemberName, setNewMemberName] = useState("");

  // Task editing state (rules, template, description)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDesc, setTaskEditDesc] = useState("");
  const [taskEditRules, setTaskEditRules] = useState("");
  const [taskEditTemplate, setTaskEditTemplate] = useState("");
  const [taskEditInstagramTemplate, setTaskEditInstagramTemplate] = useState("");
  const [taskEditLinks, setTaskEditLinks] = useState<TaskLinkItem[]>([]);
  const [savingTask, setSavingTask] = useState(false);
  const [taskSaveSuccess, setTaskSaveSuccess] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState("");

  // Score editing state
  const [editingScore, setEditingScore] = useState<number | null>(null);
  const [scoreValue, setScoreValue] = useState("");
  const [savingScore, setSavingScore] = useState(false);

  // Combined Matrix & Submissions state
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loadingAllSubmissions, setLoadingAllSubmissions] = useState(false);
  const [submissionsViewMode, setSubmissionsViewMode] = useState<"matrix" | "leaderboard">("matrix");
  const [matrixTaskFilter, setMatrixTaskFilter] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [matrixScoreFilter, setMatrixScoreFilter] = useState<"all" | "unscored" | "scored">("all");

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "task" | "team">("all");
  const [exportTaskId, setExportTaskId] = useState<string>("");
  const [exportTeamId, setExportTeamId] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  // Search + delete state
  const [teamSearch, setTeamSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [subPlanFilter, setSubPlanFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    | { type: "submission"; id: number; label: string }
    | { type: "team"; teamId: string; label: string }
    | { type: "member"; teamId: string; memberName: string; label: string }
    | null
  >(null);

  const fetchAllSubmissions = useCallback(async () => {
    setLoadingAllSubmissions(true);
    try {
      const res = await fetch("/api/admin/submissions");
      const data = await res.json();
      setAllSubmissions(data.submissions || []);
    } catch (err) {
      console.error("Failed to fetch all submissions", err);
    } finally {
      setLoadingAllSubmissions(false);
    }
  }, []);

  // Check auth on load
  useEffect(() => {
    fetchTeams().then((ok) => {
      setAuthenticated(ok);
      setChecking(false);
      if (ok) {
        fetchTasks();
        fetchRegStats();
        fetchAllSubmissions();
      }
    });
  }, [fetchAllSubmissions]);

  async function fetchRegStats() {
    try {
      const res = await fetch("/api/teams");
      const data = await res.json();
      if (data.teams) {
        setCurrentRegStats({ teamCount: data.teams.length });
      }
    } catch {
      // ignore
    }
  }

  function handleCsvFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
  }

  async function processCsvFile(file: File) {
    setRegFile(file);
    setRegError("");
    setRegSuccess("");
    setRegPreview(null);
    setRegParsing(true);

    try {
      const text = await file.text();
      if (!text.trim()) {
        setRegError("The selected CSV file is empty.");
        setRegParsing(false);
        return;
      }

      const { headers, records } = parseCsvClient(text);

      if (headers.length === 0) {
        setRegError("No header row found in the CSV file.");
        setRegParsing(false);
        return;
      }

      const findHeader = (target: string): string | undefined => {
        const normTarget = target.toLowerCase().replace(/[\s_-]+/g, "");
        return headers.find(
          (h) => h.toLowerCase().replace(/[\s_-]+/g, "") === normTarget
        );
      };

      const regIdH = findHeader("Registration ID") || findHeader("RegistrationID");
      const teamNameH = findHeader("Team Name") || findHeader("TeamName");
      const roleH = findHeader("Role");
      const nameH = findHeader("Name") || findHeader("Member Name") || findHeader("MemberName");

      const missing: string[] = [];
      if (!regIdH) missing.push('"Registration ID"');
      if (!teamNameH) missing.push('"Team Name"');
      if (!roleH) missing.push('"Role"');
      if (!nameH) missing.push('"Name"');

      if (missing.length > 0) {
        setRegError(
          `Missing required header${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Required headers are: "Registration ID", "Team Name", "Role", "Name". (Found headers in file: ${headers.map((h) => `"${h}"`).join(", ")})`
        );
        setRegParsing(false);
        return;
      }

      const validRows: Array<{ registration_id: string; team_name: string; role: string; member_name: string }> = [];
      const distinctTeams = new Set<string>();
      const seenKeys = new Set<string>();
      let skippedCount = 0;

      for (const rec of records) {
        const regId = (rec[regIdH!] || "").trim();
        const teamName = (rec[teamNameH!] || "").trim();
        const role = (rec[roleH!] || "").trim();
        const memberName = (rec[nameH!] || "").trim();

        // Skip blank rows or rows missing Registration ID or Name
        if (!regId || !memberName) {
          skippedCount++;
          continue;
        }

        const uniqueKey = `${regId.toLowerCase()}:::${role.toLowerCase()}`;
        if (seenKeys.has(uniqueKey)) {
          skippedCount++;
          continue;
        }
        seenKeys.add(uniqueKey);

        distinctTeams.add(regId.toLowerCase());
        validRows.push({
          registration_id: regId,
          team_name: teamName,
          role: role,
          member_name: memberName,
        });
      }

      if (validRows.length === 0) {
        setRegError("No valid rows found in the CSV. Every row was either blank or missing Registration ID or Name.");
        setRegParsing(false);
        return;
      }

      setRegPreview({
        headers: ["Registration ID", "Team Name", "Role", "Name"],
        validRows,
        teamCount: distinctTeams.size,
        skippedCount,
        totalParsedRows: records.length,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse CSV";
      setRegError(`CSV parse error: ${msg}`);
    } finally {
      setRegParsing(false);
    }
  }

  async function addUser(regId: string, teamName: string, role: string, memberName: string) {
    setAddUserError("");
    setAddingUser(true);

    try {
      const res = await fetch("/api/admin/registrations/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regId.trim(),
          team_name: teamName.trim(),
          role: role.trim(),
          member_name: memberName.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAddUserError(data.error || "Failed to add user.");
        return;
      }

      // Success
      setAddUserModalOpen(false);
      setNewRegId("");
      setNewTeamName("");
      setNewRole("");
      setNewMemberName("");
      setRegSuccess(`✓ Successfully added user: ${data.member_name} (${data.role}) to team ${data.registration_id}${data.team_name ? ` - ${data.team_name}` : ""}.`);
      fetchRegStats();
      fetchTeams();
    } catch {
      setAddUserError("Network error occurred while adding user.");
    } finally {
      setAddingUser(false);
    }
  }

  async function handleConfirmReplace() {
    if (!regFile) return;
    setUploadingReg(true);
    setRegError("");
    setRegSuccess("");

    try {
      const formData = new FormData();
      formData.append("file", regFile);

      const res = await fetch("/api/admin/registrations/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setRegError(data.error || "Failed to upload and replace registrations.");
      } else {
        setRegSuccess(
          `Successfully replaced registrations! ${data.inserted} member rows inserted across ${data.team_count} unique teams. (${data.skipped} rows skipped).`
        );
        setConfirmReplaceModal(false);
        setRegPreview(null);
        setRegFile(null);
        fetchRegStats();
      }
    } catch {
      setRegError("Network error occurred while uploading registrations.");
    } finally {
      setUploadingReg(false);
    }
  }

  async function fetchTeams(): Promise<boolean> {
    try {
      const res = await fetch("/api/admin/teams");
      if (res.status === 401) return false;
      const data = await res.json();
      setTeams(data.teams || []);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      console.error("Failed to fetch tasks");
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        setLoginError("Invalid password. Please try again.");
        setLoggingIn(false);
        return;
      }

      setAuthenticated(true);
      fetchTasks();
      fetchTeams();
      fetchAllSubmissions();
    } catch {
      setLoginError("Network error. Could not connect to server.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setPassword("");
  }

  async function toggleTask(taskId: number) {
    setTogglingTask(taskId);
    try {
      const res = await fetch(`/api/admin/tasks/${taskId}/toggle`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (data.success) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, is_active: data.is_active } : t
          )
        );
      }
    } catch {
      console.error("Toggle failed");
    } finally {
      setTogglingTask(null);
    }
  }

  function startEditingTask(task: Task) {
    setEditingTaskId(task.id);
    setTaskEditTitle(task.title || "");
    setTaskEditDesc(task.description || "");
    setTaskEditRules(task.rules || "");
    setTaskEditTemplate(task.linkedin_template || "");
    setTaskEditInstagramTemplate(task.instagram_template || "");
    setTaskEditLinks(
      task.links && Array.isArray(task.links)
        ? JSON.parse(JSON.stringify(task.links))
        : []
    );
    setTaskSaveSuccess(false);
    setTaskSaveError("");
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setTaskSaveSuccess(false);
    setTaskSaveError("");
  }

  function addEditLink() {
    setTaskEditLinks((prev) => [
      ...prev,
      {
        id: "link_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
        label: `Link ${prev.length + 1}: `,
        url: "",
      },
    ]);
  }

  function updateEditLink(index: number, field: "label" | "url", val: string) {
    setTaskEditLinks((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: val } : item))
    );
  }

  function removeEditLink(index: number) {
    setTaskEditLinks((prev) => prev.filter((_, idx) => idx !== index));
  }

  function moveEditLink(index: number, direction: -1 | 1) {
    setTaskEditLinks((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  }

  async function handleSaveTask(taskId: number) {
    setSavingTask(true);
    setTaskSaveError("");
    setTaskSaveSuccess(false);

    try {
      const res = await fetch(`/api/admin/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskEditTitle,
          description: taskEditDesc,
          rules: taskEditRules,
          linkedin_template: taskEditTemplate,
          instagram_template: taskEditInstagramTemplate,
          links: taskEditLinks,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setTaskSaveError(data.error || "Failed to save task configuration");
        return;
      }

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...data.task } : t))
      );
      setTaskSaveSuccess(true);
      setTimeout(() => {
        setTaskSaveSuccess(false);
        setEditingTaskId(null);
      }, 1200);
    } catch {
      setTaskSaveError("Network error while updating task");
    } finally {
      setSavingTask(false);
    }
  }

  const selectTeam = useCallback(async (teamId: string) => {
    setSelectedTeam(teamId);
    setLoadingTeam(true);
    try {
      const res = await fetch(
        `/api/admin/teams/${encodeURIComponent(teamId)}`
      );
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      console.error("Failed to load team");
    } finally {
      setLoadingTeam(false);
    }
  }, []);

  async function saveScore(submissionId: number) {
    setSavingScore(true);
    try {
      const res = await fetch(`/api/admin/submissions/${submissionId}/score`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: parseInt(scoreValue, 10) }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === submissionId ? { ...s, score: data.score } : s
          )
        );
        setAllSubmissions((prev) =>
          prev.map((s) =>
            s.id === submissionId ? { ...s, score: data.score } : s
          )
        );
        setEditingScore(null);
        fetchTeams();
      }
    } catch {
      console.error("Score save failed");
    } finally {
      setSavingScore(false);
    }
  }

  function openExport() {
    setExportScope("all");
    setExportTaskId("");
    setExportTeamId("");
    setExportMsg("");
    setExportOpen(true);
  }

  async function handleExport() {
    setExporting(true);
    setExportMsg("");

    try {
      let url = "/api/admin/export";
      const params = new URLSearchParams();
      if (exportScope === "task" && exportTaskId) {
        params.set("task_id", exportTaskId);
      } else if (exportScope === "team" && exportTeamId) {
        params.set("team_id", exportTeamId);
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportMsg(data.error || "Export failed");
        setExporting(false);
        return;
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;

      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      a.download = match ? match[1] : "tricity-export.xlsx";

      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(downloadUrl);

      setExportMsg("Download started ✓");
    } catch {
      setExportMsg("Network error. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function performDelete() {
    if (!confirmAction) return;
    setDeleting(true);
    setDeleteError("");

    try {
      let res: Response;
      if (confirmAction.type === "submission") {
        res = await fetch(`/api/admin/submissions/${confirmAction.id}`, {
          method: "DELETE",
        });
      } else if (confirmAction.type === "team") {
        res = await fetch(
          `/api/admin/teams/${encodeURIComponent(confirmAction.teamId)}`,
          { method: "DELETE" }
        );
      } else {
        res = await fetch(
          `/api/admin/members?team_id=${encodeURIComponent(
            confirmAction.teamId
          )}&member_name=${encodeURIComponent(confirmAction.memberName)}`,
          { method: "DELETE" }
        );
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Delete failed");
        setDeleting(false);
        return;
      }

      setConfirmAction(null);

      if (confirmAction.type === "submission") {
        setSubmissions((prev) => prev.filter((s) => s.id !== confirmAction.id));
        setAllSubmissions((prev) => prev.filter((s) => s.id !== confirmAction.id));
        fetchTeams();
      } else if (confirmAction.type === "team") {
        setSelectedTeam(null);
        setSubmissions([]);
        setAllSubmissions((prev) => prev.filter((s) => s.team_id !== confirmAction.teamId));
        setTeams((prev) =>
          prev.filter((t) => t.team_id !== confirmAction.teamId)
        );
      } else {
        setSubmissions((prev) =>
          prev.filter(
            (s) =>
              s.member_name.trim().toLowerCase() !==
              confirmAction.memberName.trim().toLowerCase()
          )
        );
        setAllSubmissions((prev) =>
          prev.filter(
            (s) =>
              !(
                s.team_id === confirmAction.teamId &&
                s.member_name.trim().toLowerCase() ===
                  confirmAction.memberName.trim().toLowerCase()
              )
          )
        );
        fetchTeams();
      }
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  const teamSearchLower = teamSearch.trim().toLowerCase();
  const filteredTeams = teamSearchLower
    ? teams.filter(
        (t) =>
          t.team_id.toLowerCase().includes(teamSearchLower) ||
          (t.member_names || []).some((n) =>
            n.toLowerCase().includes(teamSearchLower)
          ) ||
          (t.colleges || []).some((c) =>
            c.toLowerCase().includes(teamSearchLower)
          )
      )
    : teams;

  const subSearchLower = subSearch.trim().toLowerCase();
  const filteredSubs = submissions.filter((s) => {
    if (subSearchLower) {
      const matchSearch =
        s.member_name.toLowerCase().includes(subSearchLower) ||
        s.task_title.toLowerCase().includes(subSearchLower) ||
        (s.college_name && s.college_name.toLowerCase().includes(subSearchLower)) ||
        (s.future_plan && s.future_plan.toLowerCase().includes(subSearchLower));
      if (!matchSearch) return false;
    }

    if (subPlanFilter !== "all") {
      if (!s.future_plan) return false;
      if (subPlanFilter === "Others (please specify)") {
        if (!s.future_plan.toLowerCase().startsWith("others")) return false;
      } else {
        if (s.future_plan.toLowerCase() !== subPlanFilter.toLowerCase()) return false;
      }
    }

    return true;
  });

  interface MemberSubmissionsRow {
    teamId: string;
    memberName: string;
    collegeName?: string | null;
    futurePlan?: string | null;
    task1?: Submission;
    task2?: Submission;
    task3?: Submission;
    task4?: Submission;
    task5?: Submission;
    totalScore: number;
    submittedCount: number;
    lastCreatedAt?: string;
  }

  const matrixRows: MemberSubmissionsRow[] = useMemo(() => {
    const source = selectedTeam ? submissions : allSubmissions;
    const map = new Map<string, MemberSubmissionsRow>();

    for (const sub of source) {
      const teamId = sub.team_id || selectedTeam || "UNKNOWN";
      const normKey = `${teamId}:::${sub.member_name.trim().toLowerCase()}`;
      let row = map.get(normKey);
      if (!row) {
        row = {
          teamId,
          memberName: sub.member_name,
          collegeName: sub.college_name,
          futurePlan: sub.future_plan,
          totalScore: 0,
          submittedCount: 0,
          lastCreatedAt: sub.created_at,
        };
        map.set(normKey, row);
      }
      if (!row.collegeName && sub.college_name) row.collegeName = sub.college_name;
      if (!row.futurePlan && sub.future_plan) row.futurePlan = sub.future_plan;
      if (sub.created_at && (!row.lastCreatedAt || sub.created_at > row.lastCreatedAt)) {
        row.lastCreatedAt = sub.created_at;
      }

      if (sub.task_id === 1) row.task1 = sub;
      else if (sub.task_id === 2) row.task2 = sub;
      else if (sub.task_id === 3) row.task3 = sub;
      else if (sub.task_id === 4) row.task4 = sub;
      else if (sub.task_id === 5) row.task5 = sub;

      if (typeof sub.score === "number") {
        row.totalScore += sub.score;
      }
      row.submittedCount += 1;
    }

    let result = Array.from(map.values());

    // Search filter (team ID, member name, college, future plan)
    if (subSearchLower) {
      result = result.filter(
        (r) =>
          r.teamId.toLowerCase().includes(subSearchLower) ||
          r.memberName.toLowerCase().includes(subSearchLower) ||
          (r.collegeName && r.collegeName.toLowerCase().includes(subSearchLower)) ||
          (r.futurePlan && r.futurePlan.toLowerCase().includes(subSearchLower))
      );
    }

    // Future plan filter
    if (subPlanFilter !== "all") {
      result = result.filter((r) => {
        if (!r.futurePlan) return false;
        if (subPlanFilter === "Others (please specify)") {
          return r.futurePlan.toLowerCase().startsWith("others");
        }
        return r.futurePlan.toLowerCase() === subPlanFilter.toLowerCase();
      });
    }

    // Task filter
    if (matrixTaskFilter === "1") {
      result = result.filter((r) => Boolean(r.task1));
    } else if (matrixTaskFilter === "2") {
      result = result.filter((r) => Boolean(r.task2));
    } else if (matrixTaskFilter === "3") {
      result = result.filter((r) => Boolean(r.task3));
    } else if (matrixTaskFilter === "4") {
      result = result.filter((r) => Boolean(r.task4));
    } else if (matrixTaskFilter === "5") {
      result = result.filter((r) => Boolean(r.task5));
    }

    // Score filter
    if (matrixScoreFilter === "unscored") {
      result = result.filter(
        (r) =>
          (r.task1 && r.task1.score === null) ||
          (r.task2 && r.task2.score === null) ||
          (r.task3 && r.task3.score === null)
      );
    } else if (matrixScoreFilter === "scored") {
      result = result.filter(
        (r) =>
          (r.task1 && r.task1.score !== null) ||
          (r.task2 && r.task2.score !== null) ||
          (r.task3 && r.task3.score !== null)
      );
    }

    // Sort by teamId, then memberName
    result.sort((a, b) => {
      const cmp = a.teamId.localeCompare(b.teamId);
      if (cmp !== 0) return cmp;
      return a.memberName.localeCompare(b.memberName);
    });

    return result;
  }, [selectedTeam, submissions, allSubmissions, subSearchLower, subPlanFilter, matrixTaskFilter, matrixScoreFilter]);

  // ── Checking State ──
  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white text-slate-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin" />
          <span className="font-mono text-xs uppercase tracking-widest text-slate-500 font-semibold">
            Verifying Admin Session...
          </span>
        </div>
      </main>
    );
  }

  // ── Login Form ──
  if (!authenticated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50/60 text-slate-900">
        <div className="w-full max-w-sm rounded-2xl p-7 sm:p-8 bg-white border border-slate-200 shadow-xl">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 mx-auto mb-4 flex items-center justify-center text-xl font-bold">
              🔐
            </div>
            <h1 className="font-heading font-bold text-xl text-slate-900">
              Admin Access
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-display">
              Tri-City Hackathon Tournament Operations
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                Admin Password
              </label>
              <input
                type="password"
                className="input-field text-sm"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="btn-primary w-full text-xs py-2.5"
            >
              {loggingIn ? "Verifying..." : "Authenticate →"}
            </button>

            <div className="pt-2 text-center">
              <Link href="/" className="text-xs font-mono text-slate-500 hover:text-teal-700">
                ← Return to Public Site
              </Link>
            </div>
          </form>
        </div>
      </main>
    );
  }

  // ── Authenticated Admin Dashboard ──
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-900">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-500 hover:text-teal-700 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Home</span>
            </Link>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center">
                TC
              </div>
              <h1 className="font-heading font-bold text-sm sm:text-base text-slate-900">
                Admin Console
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openExport}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 font-mono text-xs font-semibold uppercase transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export .xlsx</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-mono text-xs font-semibold uppercase transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Tabs Navigation ── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-6">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`py-3.5 text-xs font-mono font-bold tracking-wider uppercase border-b-2 transition-colors ${
              activeTab === "tasks"
                ? "border-teal-700 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Task Availability ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab("teams")}
            className={`py-3.5 text-xs font-mono font-bold tracking-wider uppercase border-b-2 transition-colors ${
              activeTab === "teams"
                ? "border-teal-700 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Teams, Submissions &amp; Scores ({teams.length})
          </button>
          <button
            onClick={() => setActiveTab("registrations")}
            className={`py-3.5 text-xs font-mono font-bold tracking-wider uppercase border-b-2 transition-colors ${
              activeTab === "registrations"
                ? "border-teal-700 text-teal-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Upload Registrations CSV {currentRegStats ? `(${currentRegStats.teamCount} teams)` : ""}
          </button>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
        {/* ── TAB 1: TASKS TOGGLES ── */}
        {activeTab === "tasks" && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-heading font-bold text-lg text-slate-900">
                  Task Visibility &amp; Control
                </h2>
                <p className="text-xs text-slate-500 font-display">
                  Toggle tasks active or locked. Inactive tasks are locked from member submission on the public page.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {tasks.map((task) => {
                const isEditing = editingTaskId === task.id;
                const hasCustomRules = Boolean(task.rules && task.rules.trim());

                return (
                  <div
                    key={task.id}
                    className={`pro-card rounded-xl transition-all duration-200 bg-white overflow-hidden border ${
                      isEditing
                        ? "border-teal-400 ring-2 ring-teal-500/20 shadow-md"
                        : "border-slate-200 hover:border-slate-300 shadow-2xs"
                    }`}
                  >
                    {/* Card Header / Summary Row */}
                    <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-4 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                            task.is_active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          #{task.id}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-heading font-bold text-base text-slate-900 truncate">
                              {task.title}
                            </h3>
                            {task.id === 1 && (
                              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-mono font-semibold">
                                Poster &amp; LinkedIn Task
                              </span>
                            )}
                            {hasCustomRules ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-mono font-semibold">
                                📜 Custom Rules Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-500 text-[10px] font-mono">
                                Default Rules
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                            {task.description || "No mission brief provided."}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            {task.is_active ? (
                              <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Active — live submissions enabled
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">
                                ○ Locked — participants cannot enter or submit
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => (isEditing ? cancelEditingTask() : startEditingTask(task))}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-colors ${
                            isEditing
                              ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                              : "border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800"
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>{isEditing ? "Close Editor" : "Edit Rules & Details"}</span>
                        </button>

                        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                          <span className="text-[11px] font-mono text-slate-500 uppercase">
                            {task.is_active ? "On" : "Off"}
                          </span>
                          <button
                            onClick={() => toggleTask(task.id)}
                            disabled={togglingTask === task.id}
                            className={`toggle-switch shrink-0 ${task.is_active ? "active" : ""}`}
                            aria-label={`Toggle ${task.title}`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Drawer / Editor Form */}
                    {isEditing && (
                      <div className="border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6 space-y-5">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="text-base">⚙️</span>
                            <h4 className="font-heading font-bold text-sm text-slate-900">
                              Edit Task #{task.id} Configuration
                            </h4>
                          </div>
                          <span className="text-xs text-slate-500 font-mono">
                            Changes take effect immediately on task pages
                          </span>
                        </div>

                        {/* Title & Description */}
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                              Task Title
                            </label>
                            <input
                              type="text"
                              className="input-field text-xs sm:text-sm bg-white"
                              value={taskEditTitle}
                              onChange={(e) => setTaskEditTitle(e.target.value)}
                              placeholder="e.g. Task 1 — Share Your Registration Poster"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                              Mission Brief Summary
                            </label>
                            <textarea
                              rows={2}
                              className="input-field text-xs sm:text-sm bg-white"
                              value={taskEditDesc}
                              onChange={(e) => setTaskEditDesc(e.target.value)}
                              placeholder="Brief description of the challenge..."
                            />
                          </div>
                        </div>

                        {/* Rules Editor */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-mono font-semibold uppercase text-slate-700">
                              📜 Official Task Rules &amp; Evaluation Guidelines
                            </label>
                            <span className="text-[11px] font-mono text-slate-400">
                              Visible to participants on /task/{task.id}
                            </span>
                          </div>
                          <textarea
                            rows={6}
                            className="input-field text-xs sm:text-sm font-display leading-relaxed bg-white"
                            value={taskEditRules}
                            onChange={(e) => setTaskEditRules(e.target.value)}
                            placeholder="Enter numbered rules, evaluation criteria, submission instructions..."
                          />
                          <p className="text-[11px] text-slate-500 mt-1">
                            Tip: Enter each rule on a new line (e.g. &quot;1. Upload profile photo...&quot;, &quot;2. Submit public URL...&quot;).
                          </p>
                        </div>

                        {/* Task 1: LinkedIn & Instagram Template Editors */}
                        {task.id === 1 && (
                          <>
                            {/* LinkedIn Template Editor */}
                            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-mono font-semibold uppercase text-blue-900">
                                  📢 LinkedIn Post Message Template
                                </label>
                                <span className="text-[11px] font-mono text-blue-600 font-semibold">
                                  Placeholders: &#123;name&#125; &amp; &#123;college&#125;
                                </span>
                              </div>
                              <textarea
                                rows={6}
                                className="input-field text-xs sm:text-sm font-mono leading-relaxed bg-white border-blue-200"
                                value={taskEditTemplate}
                                onChange={(e) => setTaskEditTemplate(e.target.value)}
                                placeholder="I am thrilled to announce that I've joined the Tri-City Hackathon 2026! Name: {name}, College: {college}..."
                              />
                              <p className="text-[11px] text-blue-700 mt-1.5 font-display">
                                When participants click &ldquo;Copy LinkedIn Caption&rdquo; in Task 1, &#123;name&#125; will automatically be replaced with their title-cased name and &#123;college&#125; with their institution.
                              </p>
                            </div>

                            {/* Instagram Template Editor */}
                            <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-200">
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-mono font-semibold uppercase text-rose-900">
                                  📸 Instagram Post &amp; Story Message Template
                                </label>
                                <span className="text-[11px] font-mono text-rose-600 font-semibold">
                                  Placeholders: &#123;name&#125; &amp; &#123;college&#125;
                                </span>
                              </div>
                              <textarea
                                rows={6}
                                className="input-field text-xs sm:text-sm font-mono leading-relaxed bg-white border-rose-200"
                                value={taskEditInstagramTemplate}
                                onChange={(e) => setTaskEditInstagramTemplate(e.target.value)}
                                placeholder="Registered for the TRI-CITY AI HACKATHON 2026! Name: {name}, College: {college}..."
                              />
                              <p className="text-[11px] text-rose-700 mt-1.5 font-display">
                                When participants click &ldquo;Copy Instagram Caption&rdquo; in Task 1, &#123;name&#125; will automatically be replaced with their title-cased name and &#123;college&#125; with their institution.
                              </p>
                            </div>
                          </>
                        )}

                        {/* Task 2: Multi-Link Items Manager */}
                        {task.id === 2 && (
                          <div className="p-5 rounded-xl bg-teal-50/50 border border-teal-200 space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h5 className="font-heading font-bold text-sm text-teal-950 flex items-center gap-1.5">
                                  <span>🔗</span> Challenge Links Manager ({taskEditLinks.length})
                                </h5>
                                <p className="text-xs text-slate-500 font-display">
                                  Admin adds/edits/removes links. Order is preserved as entered. Participants must open every link.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={addEditLink}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-mono text-xs font-bold transition-all shadow-xs cursor-pointer"
                              >
                                <span>+ Add Link</span>
                              </button>
                            </div>

                            {taskEditLinks.length === 0 ? (
                              <div className="p-6 rounded-lg bg-white border border-dashed border-teal-300 text-center">
                                <p className="text-xs text-slate-500 font-mono mb-3">
                                  No links configured yet. Click below to add the first link.
                                </p>
                                <button
                                  type="button"
                                  onClick={addEditLink}
                                  className="btn-secondary text-xs"
                                >
                                  + Add First Link
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {taskEditLinks.map((linkItem, idx) => (
                                  <div
                                    key={linkItem.id || idx}
                                    className="p-4 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-3"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-md bg-teal-100 text-teal-800 font-mono text-xs font-bold flex items-center justify-center">
                                          #{idx + 1}
                                        </span>
                                        <span className="font-mono text-xs font-semibold text-slate-700">
                                          Link {idx + 1}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        {/* Move Up */}
                                        <button
                                          type="button"
                                          disabled={idx === 0}
                                          onClick={() => moveEditLink(idx, -1)}
                                          className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-xs text-slate-600 cursor-pointer"
                                          title="Move up"
                                        >
                                          ↑
                                        </button>
                                        {/* Move Down */}
                                        <button
                                          type="button"
                                          disabled={idx === taskEditLinks.length - 1}
                                          onClick={() => moveEditLink(idx, 1)}
                                          className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center text-xs text-slate-600 cursor-pointer"
                                          title="Move down"
                                        >
                                          ↓
                                        </button>
                                        {/* Delete */}
                                        <button
                                          type="button"
                                          onClick={() => removeEditLink(idx)}
                                          className="w-7 h-7 rounded border border-red-200 hover:bg-red-50 text-red-600 flex items-center justify-center text-xs cursor-pointer ml-1"
                                          title="Remove this link"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>

                                    <div className="grid sm:grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1">
                                          Button Label <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                          type="text"
                                          className="input-field text-xs bg-slate-50/50"
                                          value={linkItem.label}
                                          onChange={(e) =>
                                            updateEditLink(idx, "label", e.target.value)
                                          }
                                          placeholder="e.g. Link 1: Instagram post"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1">
                                          Target URL <span className="text-red-500">*</span>
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="url"
                                            className="input-field text-xs bg-slate-50/50 flex-1 font-mono"
                                            value={linkItem.url}
                                            onChange={(e) =>
                                              updateEditLink(idx, "url", e.target.value)
                                            }
                                            placeholder="https://..."
                                          />
                                          {linkItem.url && (
                                            <a
                                              href={linkItem.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="shrink-0 p-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 text-xs"
                                              title="Test URL in new tab"
                                            >
                                              ↗
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

{/* Task 3: Information note */}
                        {task.id === 3 && (
                          <div className="p-4 rounded-xl bg-teal-50/60 border border-teal-200">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base">ℹ️</span>
                              <h5 className="font-heading font-bold text-xs text-teal-900">
                                Task 3 — Link Submission Configuration
                              </h5>
                            </div>
                            <p className="text-xs text-teal-800 font-display leading-relaxed">
                              Participants submit a single URL link for Task 3. Use the <strong>Official Task Rules & Evaluation Guidelines</strong> field above to provide prompt instructions or requirements. The rules can be edited anytime and update on user screens immediately.
                            </p>
                          </div>
                        )}

                        {/* Task 4: Poster + Track Selection Configuration */}
                        {task.id === 4 && (
                          <Task4AdminConfig taskId={task.id} />
                        )}

                        {/* Task 5: Poster with Photo Overlay + Captions Configuration */}
                        {task.id === 5 && (
                          <Task5AdminConfig
                            taskId={task.id}
                            linkedinTemplate={taskEditTemplate}
                            setLinkedinTemplate={setTaskEditTemplate}
                            instagramTemplate={taskEditInstagramTemplate}
                            setInstagramTemplate={setTaskEditInstagramTemplate}
                            posterTemplateUrl={task.poster_template_url || ""}
                          />
                        )}

                        {/* Status Messages */}
                        {taskSaveError && (
                          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                            {taskSaveError}
                          </div>
                        )}
                        {taskSaveSuccess && (
                          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-semibold flex items-center gap-2">
                            <span>✓</span>
                            <span>Task rules &amp; configuration saved successfully!</span>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-3 pt-2">
                          <button
                            type="button"
                            onClick={cancelEditingTask}
                            disabled={savingTask}
                            className="btn-secondary text-xs px-4 py-2"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveTask(task.id)}
                            disabled={savingTask}
                            className="btn-primary text-xs px-5 py-2 inline-flex items-center gap-2"
                          >
                            {savingTask ? (
                              <>
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                <span>Saving...</span>
                              </>
                            ) : taskSaveSuccess ? (
                              <span>✓ Saved!</span>
                            ) : (
                              <span>Save Task Rules &amp; Details</span>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB 2: TEAMS & SCORES (COMBINED SUBMISSIONS MATRIX & LEADERBOARD) ── */}
        {activeTab === "teams" && (
          <div className="space-y-5">
            {/* View Mode & Filter Header */}
            <div className="pro-card rounded-2xl p-5 bg-white space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-heading font-bold text-lg text-slate-900 flex items-center gap-2">
                    <span>📋</span>
                    <span>Tournament Submissions &amp; Scoring Console</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-display mt-0.5">
                    Unified evaluation matrix: review member submissions and assign scores for Task 1, Task 2, and Task 3 side-by-side.
                  </p>
                </div>

                {/* View Switcher Pills */}
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200 shrink-0 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionsViewMode("matrix");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      submissionsViewMode === "matrix"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    📊 Combined Matrix View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionsViewMode("leaderboard");
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      submissionsViewMode === "leaderboard"
                        ? "bg-white text-teal-800 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    🏆 Team Leaderboard View
                  </button>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                <div className="flex-1 flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="input-field text-xs bg-slate-50/60 w-full pr-8"
                      placeholder="⌕ Search by Team ID, Member, College, or Future Plan..."
                      value={subSearch}
                      onChange={(e) => setSubSearch(e.target.value)}
                    />
                    {subSearch && (
                      <button
                        type="button"
                        onClick={() => setSubSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-mono"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <select
                    value={subPlanFilter}
                    onChange={(e) => setSubPlanFilter(e.target.value)}
                    className="input-field text-xs bg-slate-50/60 sm:w-48 cursor-pointer font-mono shrink-0"
                    title="Filter by future plan"
                  >
                    <option value="all">🎯 All Future Plans</option>
                    {FUTURE_PLAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* Task Filter */}
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono">
                    <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5">Task:</span>
                    <button
                      type="button"
                      onClick={() => setMatrixTaskFilter("all")}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        matrixTaskFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixTaskFilter("1")}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        matrixTaskFilter === "1" ? "bg-white text-teal-800 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      T1
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixTaskFilter("2")}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        matrixTaskFilter === "2" ? "bg-white text-teal-800 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      T2
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixTaskFilter("3")}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        matrixTaskFilter === "3" ? "bg-white text-teal-800 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      T3
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixTaskFilter("4")}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        matrixTaskFilter === "4" ? "bg-white text-purple-800 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      T4
                    </button>
                    <button
                      type="button"
                      onClick={() => setMatrixTaskFilter("5")}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        matrixTaskFilter === "5" ? "bg-white text-indigo-800 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      T5
                    </button>
                  </div>

                  {/* Score Filter */}
                  <select
                    value={matrixScoreFilter}
                    onChange={(e) => setMatrixScoreFilter(e.target.value as "all" | "unscored" | "scored")}
                    className="input-field text-xs bg-slate-50/60 w-36 cursor-pointer font-mono"
                  >
                    <option value="all">All Scores</option>
                    <option value="unscored">⚠️ Needs Scoring</option>
                    <option value="scored">✓ Scored</option>
                  </select>

                  {/* Team Filter / Clear Selection */}
                  {selectedTeam ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-300 text-teal-800 font-mono text-xs font-bold">
                      <span>Team: {selectedTeam}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTeam(null)}
                        className="text-teal-600 hover:text-red-600 ml-1 font-bold"
                        title="Show all teams"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        fetchAllSubmissions();
                        fetchTeams();
                      }}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-mono"
                      title="Refresh submissions"
                    >
                      ↻ Refresh
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── MODE A: COMBINED MATRIX VIEW ── */}
            {submissionsViewMode === "matrix" && (
              <div className="pro-card rounded-2xl bg-white overflow-hidden border border-slate-200 shadow-xs">
                {/* Header count bar */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">
                      Showing {matrixRows.length} member submission records
                    </span>
                    {selectedTeam && (
                      <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[11px]">
                        Filtered to {selectedTeam}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 text-[11px] flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Task Completed
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      Pending Evaluation
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      Not Submitted
                    </span>
                  </div>
                </div>

                {loadingAllSubmissions && allSubmissions.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin mx-auto mb-3" />
                    <span className="font-mono text-xs text-slate-500 uppercase tracking-wider">
                      Loading Submissions Matrix...
                    </span>
                  </div>
                ) : matrixRows.length === 0 ? (
                  <div className="p-16 text-center text-slate-400 font-mono text-xs">
                    No submissions found matching your filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[900px]">
<thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase tracking-wider text-slate-600">
                          <th className="py-3 px-4 w-28">Team ID</th>
                          <th className="py-3 px-4 w-48">Member Info</th>
                          <th className="py-3 px-4 w-60">Task 1: Poster & Social</th>
                          <th className="py-3 px-4 w-52">Task 2: Multi-Link</th>
                          <th className="py-3 px-4 w-60">Task 3: Link Submission</th>
                          <th className="py-3 px-4 w-56">Task 4: Track Selection</th>
                          <th className="py-3 px-4 w-56">Task 5: Poster + Captions</th>
                          <th className="py-3 px-4 w-28 text-center">Total Score</th>
                          <th className="py-3 px-3 w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {matrixRows.map((row) => {
                          const rowKey = `${row.teamId}:::${row.memberName}`;

                          return (
                            <tr
                              key={rowKey}
                              className="hover:bg-teal-50/20 transition-colors"
                            >
                              {/* Team ID */}
                              <td className="py-3.5 px-4 align-top">
                                <button
                                  type="button"
                                  onClick={() => setSelectedTeam(row.teamId)}
                                  className="font-mono font-bold text-slate-900 hover:text-teal-700 underline text-xs decoration-slate-300"
                                  title={`Filter by team ${row.teamId}`}
                                >
                                  {row.teamId}
                                </button>
                              </td>

                              {/* Member Info */}
                              <td className="py-3.5 px-4 align-top">
                                <div className="font-heading font-bold text-slate-900 text-sm">
                                  {row.memberName}
                                </div>
                                {row.collegeName && (
                                  <div className="text-[11px] font-mono text-slate-500 mt-0.5 truncate max-w-[180px]">
                                    🏫 {row.collegeName}
                                  </div>
                                )}
                                {row.futurePlan && (
                                  <div
                                    className="text-[10px] font-mono font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded mt-1 inline-block truncate max-w-[180px]"
                                    title={`Plan: ${row.futurePlan}`}
                                  >
                                    🎯 {row.futurePlan}
                                  </div>
                                )}
                              </td>

                              {/* Task 1: Poster & Social */}
                              <td className="py-3.5 px-4 align-top bg-slate-50/30">
                                {row.task1 ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                                        ✓ Submitted
                                      </span>
                                      <button
                                        onClick={() =>
                                          setConfirmAction({
                                            type: "submission",
                                            id: row.task1!.id,
                                            label: `Task 1 submission by "${row.memberName}"`,
                                          })
                                        }
                                        className="text-slate-300 hover:text-red-600 p-0.5 text-xs"
                                        title="Delete Task 1 submission"
                                      >
                                        🗑
                                      </button>
                                    </div>

                                    {/* Links */}
                                    {(() => {
                                      let insta = "";
                                      let linked = "";
                                      if (row.task1.answer) {
                                        const im = row.task1.answer.match(/Instagram:\s*([^\r\n]+)/i);
                                        if (im) insta = im[1].trim();
                                        const lm = row.task1.answer.match(/LinkedIn:\s*([^\r\n]+)/i);
                                        if (lm) linked = lm[1].trim();
                                      }
                                      if (!insta && row.task1.link && /instagram/i.test(row.task1.link)) {
                                        insta = row.task1.link.trim();
                                      }
                                      if (!linked && row.task1.link && (!insta || /linkedin/i.test(row.task1.link))) {
                                        linked = row.task1.link.trim();
                                      }

                                      const linkedHref = linked.startsWith("http") ? linked : `https://${linked}`;
                                      const instaHref = insta.startsWith("http") ? insta : `https://${insta}`;

                                      return (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {linked && (
                                            <a
                                              href={linkedHref}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                                            >
                                              <span>💼 LinkedIn ↗</span>
                                            </a>
                                          )}
                                          {insta && (
                                            <a
                                              href={instaHref}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
                                            >
                                              <span>📸 Instagram ↗</span>
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {/* Inline Score */}
                                    {editingScore === row.task1.id ? (
                                      <div className="flex items-center gap-1 pt-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={TASK_POINTS}
                                          className="input-field w-14 text-center text-xs py-0.5 px-1 font-mono"
                                          value={scoreValue}
                                          onChange={(e) => setScoreValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveScore(row.task1!.id);
                                            if (e.key === "Escape") setEditingScore(null);
                                          }}
                                        />
                                        <button
                                          onClick={() => saveScore(row.task1!.id)}
                                          disabled={savingScore}
                                          className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-xs font-bold"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => setEditingScore(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingScore(row.task1!.id);
                                          setScoreValue(
                                            row.task1!.score !== null ? String(row.task1!.score) : ""
                                          );
                                        }}
                                        className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-all cursor-pointer block ${
                                          row.task1.score !== null
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        {row.task1.score !== null ? `Score: ${row.task1.score} / ${TASK_POINTS}` : "Assign Score"}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    — Not submitted
                                  </span>
                                )}
                              </td>

                              {/* Task 2: Multi-Link Challenge */}
                              <td className="py-3.5 px-4 align-top">
                                {row.task2 ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-100 text-teal-800">
                                        ✓ All Links Opened
                                      </span>
                                      <button
                                        onClick={() =>
                                          setConfirmAction({
                                            type: "submission",
                                            id: row.task2!.id,
                                            label: `Task 2 submission by "${row.memberName}"`,
                                          })
                                        }
                                        className="text-slate-300 hover:text-red-600 p-0.5 text-xs"
                                        title="Delete Task 2 submission"
                                      >
                                        🗑
                                      </button>
                                    </div>

                                    {/* Inline Score */}
                                    {editingScore === row.task2.id ? (
                                      <div className="flex items-center gap-1 pt-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={TASK_POINTS}
                                          className="input-field w-14 text-center text-xs py-0.5 px-1 font-mono"
                                          value={scoreValue}
                                          onChange={(e) => setScoreValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveScore(row.task2!.id);
                                            if (e.key === "Escape") setEditingScore(null);
                                          }}
                                        />
                                        <button
                                          onClick={() => saveScore(row.task2!.id)}
                                          disabled={savingScore}
                                          className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-xs font-bold"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => setEditingScore(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingScore(row.task2!.id);
                                          setScoreValue(
                                            row.task2!.score !== null ? String(row.task2!.score) : ""
                                          );
                                        }}
                                        className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-all cursor-pointer block ${
                                          row.task2.score !== null
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        {row.task2.score !== null ? `Score: ${row.task2.score} / ${TASK_POINTS}` : "Assign Score"}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    — Not submitted
                                  </span>
                                )}
                              </td>

                              {/* Task 3: Link Submission */}
                              <td className="py-3.5 px-4 align-top bg-slate-50/30">
                                {row.task3 ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-100 text-teal-800">
                                        ✓ Submitted
                                      </span>
                                      <button
                                        onClick={() =>
                                          setConfirmAction({
                                            type: "submission",
                                            id: row.task3!.id,
                                            label: `Task 3 submission by "${row.memberName}"`,
                                          })
                                        }
                                        className="text-slate-300 hover:text-red-600 p-0.5 text-xs"
                                        title="Delete Task 3 submission"
                                      >
                                        🗑
                                      </button>
                                    </div>

                                    {/* Link button */}
                                    {row.task3.link && (
                                      <div className="truncate max-w-[200px]">
                                        <a
                                          href={
                                            row.task3.link.startsWith("http")
                                              ? row.task3.link
                                              : `https://${row.task3.link}`
                                          }
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[11px] font-mono text-teal-700 hover:underline truncate"
                                          title={row.task3.link}
                                        >
                                          <span>🔗 Link ↗</span>
                                          <span className="truncate max-w-[140px] text-slate-500">
                                            {row.task3.link}
                                          </span>
                                        </a>
                                      </div>
                                    )}

                                    {/* Inline Score */}
                                    {editingScore === row.task3.id ? (
                                      <div className="flex items-center gap-1 pt-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={TASK_POINTS}
                                          className="input-field w-14 text-center text-xs py-0.5 px-1 font-mono"
                                          value={scoreValue}
                                          onChange={(e) => setScoreValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveScore(row.task3!.id);
                                            if (e.key === "Escape") setEditingScore(null);
                                          }}
                                        />
                                        <button
                                          onClick={() => saveScore(row.task3!.id)}
                                          disabled={savingScore}
                                          className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-xs font-bold"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => setEditingScore(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingScore(row.task3!.id);
                                          setScoreValue(
                                            row.task3!.score !== null ? String(row.task3!.score) : ""
                                          );
                                        }}
                                        className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-all cursor-pointer block ${
                                          row.task3.score !== null
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        {row.task3.score !== null ? `Score: ${row.task3.score} / ${TASK_POINTS}` : "Assign Score"}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    — Not submitted
                                  </span>
                                )}
                              </td>

                              {/* Task 4: Track Selection */}
                              <td className="py-3.5 px-4 align-top bg-slate-50/30">
                                {row.task4 ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-800">
                                        ✓ Submitted
                                      </span>
                                      <button
                                        onClick={() =>
                                          setConfirmAction({
                                            type: "submission",
                                            id: row.task4!.id,
                                            label: `Task 4 submission by "${row.memberName}"`,
                                          })
                                        }
                                        className="text-slate-300 hover:text-red-600 p-0.5 text-xs"
                                        title="Delete Task 4 submission"
                                      >
                                        🗑
                                      </button>
                                    </div>

                                    {/* Track info */}
                                    <div className="space-y-1">
                                      <div className="text-[11px] font-mono text-purple-700">
                                        Track: {row.task4.answer?.replace("Track selected: ", "") || "—"}
                                      </div>
                                      {row.task4.link && (
                                        <div className="truncate max-w-[200px]">
                                          <a
                                            href={
                                              row.task4.link.startsWith("http")
                                                ? row.task4.link
                                                : `https://${row.task4.link}`
                                            }
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-700 hover:underline truncate"
                                            title={row.task4.link}
                                          >
                                            <span>💼 LinkedIn ↗</span>
                                            <span className="truncate max-w-[140px] text-slate-500">
                                              {row.task4.link}
                                            </span>
                                          </a>
                                        </div>
                                      )}
                                    </div>

                                    {/* Inline Score */}
                                    {editingScore === row.task4.id ? (
                                      <div className="flex items-center gap-1 pt-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={TASK_POINTS}
                                          className="input-field w-14 text-center text-xs py-0.5 px-1 font-mono"
                                          value={scoreValue}
                                          onChange={(e) => setScoreValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveScore(row.task4!.id);
                                            if (e.key === "Escape") setEditingScore(null);
                                          }}
                                        />
                                        <button
                                          onClick={() => saveScore(row.task4!.id)}
                                          disabled={savingScore}
                                          className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-xs font-bold"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => setEditingScore(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingScore(row.task4!.id);
                                          setScoreValue(
                                            row.task4!.score !== null ? String(row.task4!.score) : ""
                                          );
                                        }}
                                        className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-all cursor-pointer block ${
                                          row.task4.score !== null
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        {row.task4.score !== null ? `Score: ${row.task4.score} / ${TASK_POINTS}` : "Assign Score"}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    — Not submitted
                                  </span>
                                )}
                              </td>

                              {/* Task 5: Poster + Captions */}
                              <td className="py-3.5 px-4 align-top bg-slate-50/30">
                                {row.task5 ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800">
                                        ✓ Submitted
                                      </span>
                                      <button
                                        onClick={() =>
                                          setConfirmAction({
                                            type: "submission",
                                            id: row.task5!.id,
                                            label: `Task 5 submission by "${row.memberName}"`,
                                          })
                                        }
                                        className="text-slate-300 hover:text-red-600 p-0.5 text-xs"
                                        title="Delete Task 5 submission"
                                      >
                                        🗑
                                      </button>
                                    </div>

                                    {/* Links */}
                                    <div className="space-y-1">
                                      {(() => {
                                        let insta = "";
                                        let linked = "";
                                        if (row.task5.answer) {
                                          const im = row.task5.answer.match(/Instagram:\s*([^\r\n]+)/i);
                                          if (im) insta = im[1].trim();
                                          const lm = row.task5.answer.match(/LinkedIn:\s*([^\r\n]+)/i);
                                          if (lm) linked = lm[1].trim();
                                        }
                                        // Fallback: if answer doesn't have prefixes but link exists
                                        if (!insta && !linked && row.task5.link) {
                                          linked = row.task5.link.trim();
                                        }
                                        // If only one URL in answer without prefix, guess based on link field
                                        if (!insta && !linked && row.task5.answer && !row.task5.answer.includes(":")) {
                                          const urls = row.task5.answer.split(/\s+/).filter(Boolean);
                                          if (urls.length === 1) {
                                            if (row.task5.link && urls[0] === row.task5.link.trim()) {
                                              linked = urls[0];
                                            } else {
                                              insta = urls[0];
                                            }
                                          }
                                        }

                                        const linkedHref = linked.startsWith("http") ? linked : `https://${linked}`;
                                        const instaHref = insta.startsWith("http") ? insta : `https://${insta}`;

                                        return (
                                          <div className="flex flex-wrap gap-1">
                                            {linked && (
                                              <a
                                                href={linkedHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                                              >
                                                <span>💼 LinkedIn ↗</span>
                                              </a>
                                            )}
                                            {insta && (
                                              <a
                                                href={instaHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100"
                                              >
                                                <span>📸 Instagram ↗</span>
                                              </a>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </div>

                                    {/* Inline Score */}
                                    {editingScore === row.task5.id ? (
                                      <div className="flex items-center gap-1 pt-1">
                                        <input
                                          type="number"
                                          min="0"
                                          max={TASK_POINTS}
                                          className="input-field w-14 text-center text-xs py-0.5 px-1 font-mono"
                                          value={scoreValue}
                                          onChange={(e) => setScoreValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") saveScore(row.task5!.id);
                                            if (e.key === "Escape") setEditingScore(null);
                                          }}
                                        />
                                        <button
                                          onClick={() => saveScore(row.task5!.id)}
                                          disabled={savingScore}
                                          className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono text-xs font-bold"
                                        >
                                          ✓
                                        </button>
                                        <button
                                          onClick={() => setEditingScore(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingScore(row.task5!.id);
                                          setScoreValue(
                                            row.task5!.score !== null ? String(row.task5!.score) : ""
                                          );
                                        }}
                                        className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold border transition-all cursor-pointer block ${
                                          row.task5.score !== null
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                                            : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        {row.task5.score !== null ? `Score: ${row.task5.score} / ${TASK_POINTS}` : "Assign Score"}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-mono text-[11px]">
                                    — Not submitted
                                  </span>
                                )}
                              </td>

                              {/* Total Score */}
                              <td className="py-3.5 px-4 align-top text-center">
                                <div className="font-mono font-bold text-sm text-slate-900">
                                  {row.totalScore}
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    /{row.submittedCount * TASK_POINTS}
                                  </span>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {row.submittedCount} / 5 tasks
                                </span>
                              </td>

                              {/* Remove User Action */}
                              <td className="py-3.5 px-3 align-top text-center">
                                <button
                                  onClick={() =>
                                    setConfirmAction({
                                      type: "member",
                                      teamId: row.teamId,
                                      memberName: row.memberName,
                                      label: `member "${row.memberName}" (${row.teamId}) and all their submissions`,
                                    })
                                  }
                                  className="w-7 h-7 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-xs mx-auto"
                                  title="Remove member & submissions"
                                >
                                  🗑
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── MODE B: TEAM LEADERBOARD & DETAIL SPLIT VIEW ── */}
            {submissionsViewMode === "leaderboard" && (
              <div>
                {teams.length === 0 ? (
                  <div className="pro-card rounded-2xl p-16 text-center max-w-md mx-auto bg-white">
                    <div className="text-3xl mb-3">📭</div>
                    <h3 className="font-heading font-bold text-lg text-slate-900 mb-1">
                      No Submissions Recorded
                    </h3>
                    <p className="text-xs text-slate-500 font-display">
                      Once participants submit challenge solutions, their teams and scores will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="grid lg:grid-cols-12 gap-6 items-start">
                    {/* Team List Column */}
                    <div className="lg:col-span-5 space-y-3">
                      <div className="pro-card rounded-2xl p-5 bg-white">
                        <div className="flex items-center justify-between mb-3">
                          <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-slate-700">
                            Team Leaderboard ({teams.length})
                          </h2>
                          <span className="text-[11px] font-mono text-slate-400">
                            Sorted by total score
                          </span>
                        </div>
                        <input
                          type="text"
                          className="input-field text-xs mb-3"
                          placeholder="⌕ Search by team ID or member name..."
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                        />

                        {filteredTeams.length === 0 && teamSearch && (
                          <div className="text-center py-6 text-xs text-slate-400 font-mono">
                            No teams match &quot;{teamSearch}&quot;
                          </div>
                        )}

                        <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
                          {filteredTeams.map((team, index) => {
                            const isSelected = selectedTeam === team.team_id;
                            return (
                              <div
                                key={team.team_id}
                                onClick={() => selectTeam(team.team_id)}
                                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-teal-50/60 border-teal-500 shadow-2xs"
                                    : "bg-white border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2.5">
                                    <span className="font-mono text-xs font-bold text-slate-500 w-5">
                                      #{index + 1}
                                    </span>
                                    <span className="font-heading font-bold text-sm text-slate-900 truncate">
                                      {team.team_id}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-teal-700">
                                      {team.total_score}
                                      <span className="text-[10px] text-slate-400 font-normal">/{MAX_SCORE}</span>
                                    </span>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmAction({
                                          type: "team",
                                          teamId: team.team_id,
                                          label: `team "${team.team_id}" (all ${team.submission_count} submissions)`,
                                        });
                                      }}
                                      className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 text-xs"
                                      title={`Delete team ${team.team_id}`}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                                  <span>{team.member_count} members</span>
                                  <span>•</span>
                                  <span>{team.submission_count} subs</span>
                                  <span>•</span>
                                  <span>Avg: {team.avg_score !== null ? team.avg_score.toFixed(1) : "—"}</span>
                                </div>

                                {team.member_names && team.member_names.length > 0 && (
                                  <div className="text-[11px] text-slate-400 mt-1.5 truncate font-display">
                                    {team.member_names.join(", ")}
                                  </div>
                                )}

                                {team.colleges && team.colleges.length > 0 && (
                                  <div className="text-[11px] text-teal-700 mt-1 font-mono flex items-center gap-1 truncate">
                                    <span>🏫</span>
                                    <span>{team.colleges.join(", ")}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Team Matrix Detail Column */}
                    <div className="lg:col-span-7">
                      {selectedTeam === null ? (
                        <div className="pro-card rounded-2xl p-16 text-center bg-white flex flex-col items-center justify-center min-h-[400px]">
                          <div className="text-3xl mb-3">👈</div>
                          <h3 className="font-heading font-bold text-base text-slate-800 mb-1">
                            Select a Team to View Matrix
                          </h3>
                          <p className="text-xs text-slate-400 font-display">
                            Click on any team on the left to inspect their Task 1, 2, and 3 submissions.
                          </p>
                        </div>
                      ) : loadingTeam ? (
                        <div className="pro-card rounded-2xl p-16 text-center bg-white flex flex-col items-center justify-center min-h-[400px]">
                          <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin mb-3" />
                          <span className="font-mono text-xs uppercase tracking-wider text-slate-500 font-semibold">
                            Loading Submissions for {selectedTeam}...
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Selected Team Bar */}
                          <div className="pro-card rounded-2xl p-5 bg-white flex items-center justify-between">
                            <div>
                              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                                Viewing Team Matrix
                              </div>
                              <h2 className="font-heading font-bold text-xl text-slate-900">
                                Team: {selectedTeam}
                              </h2>
                            </div>

                            <button
                              onClick={() => setSelectedTeam(null)}
                              className="btn-secondary text-xs py-1.5 px-3"
                            >
                              Clear Selection
                            </button>
                          </div>

                          {/* Render this team's matrix rows */}
                          <div className="pro-card rounded-xl bg-white overflow-hidden border border-slate-200 shadow-xs">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase tracking-wider text-slate-600">
                                    <th className="py-3 px-4 w-44">Member</th>
                                    <th className="py-3 px-4">Task 1: Poster</th>
                                    <th className="py-3 px-4">Task 2: Multi-Link</th>
                                    <th className="py-3 px-4">Task 3: Link</th>
                                    <th className="py-3 px-4 text-center">Score</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs">
                                  {matrixRows.map((row) => (
                                    <tr key={row.memberName} className="hover:bg-teal-50/20">
                                      <td className="py-3 px-4 align-top">
                                        <div className="font-heading font-bold text-slate-900">
                                          {row.memberName}
                                        </div>
                                        {row.collegeName && (
                                          <div className="text-[10px] font-mono text-slate-500">
                                            {row.collegeName}
                                          </div>
                                        )}
                                      </td>

                                      {/* Task 1 */}
                                      <td className="py-3 px-4 align-top">
                                        {row.task1 ? (
                                          <div>
                                            <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                              ✓ Submitted
                                            </span>
                                            <div className="mt-1">
                                              <button
                                                onClick={() => {
                                                  setEditingScore(row.task1!.id);
                                                  setScoreValue(
                                                    row.task1!.score !== null ? String(row.task1!.score) : ""
                                                  );
                                                }}
                                                className="text-[11px] font-mono font-bold text-teal-800 hover:underline"
                                              >
                                                {row.task1.score !== null ? `${row.task1.score} / ${TASK_POINTS}` : "Assign Score"}
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-slate-300 font-mono text-[10px]">—</span>
                                        )}
                                      </td>

                                      {/* Task 2 */}
                                      <td className="py-3 px-4 align-top">
                                        {row.task2 ? (
                                          <div>
                                            <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                                              ✓ All Opened
                                            </span>
                                            <div className="mt-1">
                                              <button
                                                onClick={() => {
                                                  setEditingScore(row.task2!.id);
                                                  setScoreValue(
                                                    row.task2!.score !== null ? String(row.task2!.score) : ""
                                                  );
                                                }}
                                                className="text-[11px] font-mono font-bold text-teal-800 hover:underline"
                                              >
                                                {row.task2.score !== null ? `${row.task2.score} / ${TASK_POINTS}` : "Assign Score"}
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-slate-300 font-mono text-[10px]">—</span>
                                        )}
                                      </td>

                                      {/* Task 3 */}
                                      <td className="py-3 px-4 align-top">
                                        {row.task3 ? (
                                          <div>
                                            <span className="text-[10px] font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                                              ✓ Submitted
                                            </span>
                                            <div className="mt-1">
                                              <button
                                                onClick={() => {
                                                  setEditingScore(row.task3!.id);
                                                  setScoreValue(
                                                    row.task3!.score !== null ? String(row.task3!.score) : ""
                                                  );
                                                }}
                                                className="text-[11px] font-mono font-bold text-teal-800 hover:underline"
                                              >
                                                {row.task3.score !== null ? `${row.task3.score} / ${TASK_POINTS}` : "Assign Score"}
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-slate-300 font-mono text-[10px]">—</span>
                                        )}
                                      </td>

                                      {/* Total */}
                                      <td className="py-3 px-4 align-top text-center font-mono font-bold text-slate-900">
                                        {row.totalScore}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

{/* ── TAB 3: REGISTRATIONS CSV UPLOAD ── */}
        {activeTab === "registrations" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="font-heading font-bold text-lg text-slate-900">
                  Team Registrations CSV Management
                </h2>
                <p className="text-xs text-slate-500 font-display">
                  Upload your registered teams CSV. Replaces all rows in the "registrations" table in a single atomic transaction without touching submissions or any other tables.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {currentRegStats && (
                  <div className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono text-xs">
                    Active Teams: <strong>{currentRegStats.teamCount}</strong>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setAddUserModalOpen(!addUserModalOpen);
                    setAddUserError("");
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold uppercase transition-colors cursor-pointer ${
                    addUserModalOpen
                      ? "bg-slate-100 border-slate-300 text-slate-700"
                      : "border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d={addUserModalOpen ? "M6 18L18 6M6 6l12 12" : "M12 4v16m8-8H4"}
                    />
                  </svg>
                  <span>{addUserModalOpen ? "Close Form" : "Add User"}</span>
                </button>
              </div>
            </div>

            {/* Add User Form */}
            {addUserModalOpen && (
              <div className="pro-card rounded-2xl p-6 bg-white border border-teal-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-heading font-bold text-base text-slate-900 flex items-center gap-2">
                      <span className="w-6 h-6 rounded-md bg-teal-600 text-white text-xs flex items-center justify-center font-mono">
                        +
                      </span>
                      Add Individual User / Team Member
                    </h3>
                    <p className="text-xs text-slate-500 font-display mt-0.5">
                      Directly add a new member into the registrations table without re-uploading a full CSV.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddUserModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 font-mono text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {addUserError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                    {addUserError}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addUser(newRegId, newTeamName, newRole, newMemberName);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1. Registration ID */}
                    <div>
                      <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                        Registration ID <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="input-field text-xs font-mono uppercase bg-white"
                        value={newRegId}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setNewRegId(val);
                        }}
                        placeholder="e.g. TRI26001 or REG-001"
                        required
                      />
                      <p className="text-[10px] font-mono text-slate-400 mt-1">
                        Team identifier used for task start &amp; submission.
                      </p>
                    </div>

                    {/* 2. Team Name */}
                    <div>
                      <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                        Team Name
                      </label>
                      <input
                        type="text"
                        className="input-field text-xs bg-white"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="e.g. Team Alpha"
                      />
                      <p className="text-[10px] font-mono text-slate-400 mt-1">
                        Optional if the Registration ID already exists.
                      </p>
                    </div>

                    {/* 3. Role */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-mono font-semibold uppercase text-slate-700">
                          Role
                        </label>
                        <div className="flex items-center gap-1">
                          {["Leader", "Member", "Member 1", "Member 2"].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setNewRole(r)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                                newRole.toLowerCase() === r.toLowerCase()
                                  ? "bg-teal-600 text-white font-bold"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="text"
                        className="input-field text-xs bg-white font-mono"
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        placeholder="e.g. Leader or Member"
                      />
                    </div>

                    {/* 4. Member Name */}
                    <div>
                      <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="input-field text-xs bg-white"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        required
                      />
                      <p className="text-[10px] font-mono text-slate-400 mt-1">
                        Full participant name.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddUserModalOpen(false);
                        setAddUserError("");
                      }}
                      className="btn-secondary text-xs py-2 px-5 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingUser}
                      className="btn-primary text-xs py-2 px-6 bg-teal-700 hover:bg-teal-800 text-white font-mono font-bold transition-colors shadow-xs cursor-pointer inline-flex items-center gap-2"
                    >
                      {addingUser ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Adding User...</span>
                        </>
                      ) : (
                        <span>+ Add User to Database</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Upload Box Card */}
            <div className="pro-card rounded-2xl p-6 bg-white border border-slate-200 shadow-2xs space-y-5">
              <div className="border-2 border-dashed border-slate-200 hover:border-teal-500 rounded-xl p-6 text-center transition-colors bg-slate-50/50">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700 text-xl font-bold">
                  📄
                </div>
                <h3 className="font-heading font-bold text-sm text-slate-900 mb-1">
                  Select or Drop Registrations CSV
                </h3>
                <p className="text-xs text-slate-500 font-display mb-4 max-w-md mx-auto">
                  Required column headers (matched case-insensitively by name):
                  <br />
                  <code className="text-[11px] font-mono font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded mt-1 inline-block">
                    Registration ID, Team Name, Role, Name
                  </code>
                </p>

                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-mono text-xs font-semibold uppercase tracking-wider cursor-pointer shadow-sm transition-colors">
                  <span>Browse CSV File</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvFileSelect}
                  />
                </label>

                {regFile && (
                  <p className="mt-3 text-xs font-mono text-slate-700">
                    Selected file: <strong className="text-teal-800">{regFile.name}</strong> ({Math.round(regFile.size / 1024)} KB)
                  </p>
                )}
              </div>

              {/* Parsing State */}
              {regParsing && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-mono flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                  Parsing and validating CSV headers...
                </div>
              )}

              {/* Error Banner */}
              {regError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono leading-relaxed">
                  <div className="font-bold mb-1 flex items-center gap-1.5">
                    <span>⚠</span> CSV Validation Error
                  </div>
                  {regError}
                </div>
              )}

              {/* Success Banner */}
              {regSuccess && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono leading-relaxed">
                  <div className="font-bold mb-1 flex items-center gap-1.5">
                    <span>✓</span> Operation Successful
                  </div>
                  {regSuccess}
                </div>
              )}

              {/* Preview Card */}
              {regPreview && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading font-bold text-sm text-slate-900">
                      CSV Import Preview
                    </h4>
                    <span className="text-[11px] font-mono text-slate-500">
                      Total rows read: {regPreview.totalParsedRows}
                    </span>
                  </div>

                  {/* Summary Metric Chips */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-emerald-900">
                      <span className="text-[11px] font-mono uppercase font-bold text-emerald-700 block">
                        Rows to Insert
                      </span>
                      <span className="text-xl font-heading font-black">
                        {regPreview.validRows.length}
                      </span>
                      <span className="text-[11px] font-display text-emerald-600 block">
                        members ready to import
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200/80 text-teal-900">
                      <span className="text-[11px] font-mono uppercase font-bold text-teal-700 block">
                        Unique Teams
                      </span>
                      <span className="text-xl font-heading font-black">
                        {regPreview.teamCount}
                      </span>
                      <span className="text-[11px] font-display text-teal-600 block">
                        distinct Registration IDs
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900">
                      <span className="text-[11px] font-mono uppercase font-bold text-amber-700 block">
                        Rows Skipped
                      </span>
                      <span className="text-xl font-heading font-black">
                        {regPreview.skippedCount}
                      </span>
                      <span className="text-[11px] font-display text-amber-600 block">
                        blank or missing ID/Name
                      </span>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs font-mono font-semibold text-slate-700">
                      <span>Previewing First 8 Rows</span>
                      <span className="text-[11px] text-slate-500">
                        {regPreview.validRows.length} total valid entries
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200 text-[11px] uppercase">
                          <tr>
                            <th className="px-3 py-2">#</th>
                            <th className="px-3 py-2">Registration ID</th>
                            <th className="px-3 py-2">Team Name</th>
                            <th className="px-3 py-2">Role</th>
                            <th className="px-3 py-2">Name</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {regPreview.validRows.slice(0, 8).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                              <td className="px-3 py-2 font-bold text-teal-800">{row.registration_id}</td>
                              <td className="px-3 py-2 text-slate-700">{row.team_name}</td>
                              <td className="px-3 py-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                                  {row.role || "Member"}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-900 font-medium">{row.member_name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Action Confirmation Buttons */}
                  <div className="pt-3 flex flex-wrap gap-3 justify-end items-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRegFile(null);
                        setRegPreview(null);
                        setRegError("");
                      }}
                      className="btn-secondary text-xs px-4 py-2"
                    >
                      Cancel &amp; Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReplaceModal(true)}
                      className="btn-primary text-xs px-5 py-2.5 bg-red-600 hover:bg-red-700 border-red-700 shadow-sm"
                    >
                      Confirm &amp; Replace Registrations →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Confirm Registrations Replace Modal ── */}
      {confirmReplaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl p-6 sm:p-7 bg-white border border-slate-200 shadow-2xl space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center text-xl font-bold mx-auto mb-3">
                ⚠️
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900">
                Replace All Registrations?
              </h3>
              <p className="text-xs text-slate-600 mt-2 font-display leading-relaxed">
                This will delete all existing rows in the <strong className="text-slate-900">&quot;registrations&quot;</strong> table and insert <strong>{regPreview?.validRows.length}</strong> new members across <strong>{regPreview?.teamCount}</strong> teams in a single transaction.
              </p>
              <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-600 text-left">
                ✓ Previous submissions and scores remain completely untouched.
                <br />
                ✓ Rollback automatically occurs if an error occurs.
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmReplaceModal(false)}
                disabled={uploadingReg}
                className="btn-secondary flex-1 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReplace}
                disabled={uploadingReg}
                className="flex-1 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-mono text-xs font-bold transition-colors shadow-sm"
              >
                {uploadingReg ? "Replacing..." : "Yes, Replace All"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Modal ── */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl p-6 sm:p-7 bg-white border border-slate-200 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg text-slate-900">
                Export Submissions &amp; Standings
              </h3>
              <button
                onClick={() => setExportOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-mono"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 font-display mb-5 leading-relaxed">
              Export verified data to Microsoft Excel format (.xlsx) including member responses, scores, and complete leaderboard statistics.
            </p>

            <div className="space-y-3">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "all"}
                  onChange={() => setExportScope("all")}
                  className="mt-0.5"
                />
                <div>
                  <span className="block text-xs font-mono font-bold text-slate-900 uppercase">
                    Total Event Dataset
                  </span>
                  <span className="text-[11px] text-slate-500 font-display">
                    All submissions from every team, all tasks, plus summary rankings.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "task"}
                  onChange={() => setExportScope("task")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="block text-xs font-mono font-bold text-slate-900 uppercase">
                    By Specific Task
                  </span>
                  {exportScope === "task" && (
                    <select
                      className="input-field mt-2 text-xs"
                      value={exportTaskId}
                      onChange={(e) => setExportTaskId(e.target.value)}
                    >
                      <option value="">Select a task...</option>
                      {tasks.map((task) => (
                        <option key={task.id} value={String(task.id)}>
                          Task #{task.id}: {task.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
                <input
                  type="radio"
                  name="exportScope"
                  checked={exportScope === "team"}
                  onChange={() => setExportScope("team")}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="block text-xs font-mono font-bold text-slate-900 uppercase">
                    By Specific Team
                  </span>
                  {exportScope === "team" && (
                    <select
                      className="input-field mt-2 text-xs"
                      value={exportTeamId}
                      onChange={(e) => setExportTeamId(e.target.value)}
                    >
                      <option value="">Select a team...</option>
                      {teams.map((team) => (
                        <option key={team.team_id} value={team.team_id}>
                          {team.team_id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>

            {exportMsg && (
              <div
                className={`mt-4 text-xs font-mono p-3 rounded-lg ${
                  exportMsg.startsWith("Download")
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {exportMsg}
              </div>
            )}

            <button
              onClick={handleExport}
              disabled={
                exporting ||
                (exportScope === "task" && !exportTaskId) ||
                (exportScope === "team" && !exportTeamId)
              }
              className="btn-primary w-full mt-5 text-xs py-2.5"
            >
              {exporting ? "Generating Spreadsheet..." : "Download Excel (.xlsx) →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl p-6 sm:p-7 bg-white border border-slate-200 shadow-2xl">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center text-xl font-bold mx-auto mb-3">
                ⚠
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900">
                Confirm Deletion
              </h3>
              <p className="text-xs text-slate-600 mt-2 font-display leading-relaxed">
                Permanently delete <strong className="text-slate-900">{confirmAction.label}</strong>? This will remove submissions and recalculate leaderboard rankings immediately.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono mb-4">
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                disabled={deleting}
                className="btn-secondary flex-1 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={performDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-mono text-xs font-bold transition-colors"
              >
                {deleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
