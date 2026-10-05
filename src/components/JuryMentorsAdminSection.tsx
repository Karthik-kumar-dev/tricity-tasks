"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

export interface JuryMentorAdminEntry {
  id: string;
  role: "jury" | "mentor";
  name: string;
  designation: string;
  bio?: string;
  original_photo_url: string;
  poster_url: string;
  identifier: string;
  created_at: string;
  updated_at: string;
}

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

const CONFIG = {
  jury: {
    template: "/posters/jury.png",
    photo: { cx: 808, cy: 605, diameter: 330 },
    nameBox: { x1: 604, x2: 1036, y1: 755, y2: 835, padding: 16 },
    desigBox: { x1: 685, x2: 915, y1: 842, y2: 885, padding: 10 },
    nameColor: "#11291f",
    desigColor: "#0b3d2c",
  },
  mentor: {
    template: "/posters/mentor.png",
    photo: { cx: 820, cy: 350, diameter: 370 },
    nameBox: { x1: 630, x2: 1030, y1: 535, y2: 610, padding: 16 },
    desigBox: { x1: 670, x2: 980, y1: 615, y2: 680, padding: 16 },
    nameColor: "#ffffff",
    desigColor: "#0b3d2c",
  },
};

const templateImgCache = new Map<string, Promise<HTMLImageElement>>();

function getCachedImage(src: string): Promise<HTMLImageElement> {
  if (!templateImgCache.has(src)) {
    templateImgCache.set(
      src,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      })
    );
  }
  return templateImgCache.get(src)!;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load user image"));
    img.src = src;
  });
}

function renderFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x1: number; x2: number; y1: number; y2: number; padding: number },
  options: {
    color: string;
    weight?: number | string;
    fontFamily?: string;
    startSize?: number;
    minSize?: number;
    maxLines?: number;
    lineHeightMultiplier?: number;
  }
) {
  const {
    color,
    weight = 800,
    fontFamily = "'Montserrat', 'Poppins', sans-serif",
    startSize = 36,
    minSize = 18,
    maxLines = 2,
    lineHeightMultiplier = 1.15,
  } = options;

  const availableWidth = Math.max(50, box.x2 - box.x1 - box.padding * 2);
  const availableHeight = Math.max(30, box.y2 - box.y1);
  const centerX = (box.x1 + box.x2) / 2;
  const rawContent = text.trim();
  if (!rawContent) return;

  let fontSize = startSize;
  let lines: string[] = [];

  function wrapText(size: number): string[] {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    const words = rawContent.split(/\s+/);
    const res: string[] = [];
    let cur = "";

    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width <= availableWidth) {
        cur = test;
      } else {
        if (cur) res.push(cur);
        cur = w;
      }
    }
    if (cur) res.push(cur);
    return res;
  }

  while (fontSize >= minSize) {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    if (ctx.measureText(rawContent).width <= availableWidth) {
      lines = [rawContent];
      break;
    }
    fontSize -= 1;
  }

  if (lines.length === 0) {
    fontSize = Math.min(startSize, Math.floor(availableHeight / (maxLines * 1.1)));
    fontSize = Math.max(minSize, Math.min(fontSize, 30));

    while (fontSize >= minSize) {
      const wrapped = wrapText(fontSize);
      if (wrapped.length <= maxLines) {
        lines = wrapped;
        break;
      }
      fontSize -= 1;
    }

    if (lines.length === 0) {
      fontSize = minSize;
      const wrapped = wrapText(fontSize);
      lines = wrapped.slice(0, maxLines);
      let last = lines[lines.length - 1];
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      while (last.length > 0 && ctx.measureText(`${last}...`).width > availableWidth) {
        last = last.slice(0, -1);
      }
      lines[lines.length - 1] = `${last}...`;
    }
  }

  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = fontSize * lineHeightMultiplier;
  const totalBlockHeight = lines.length * lineHeight;
  const startY = (box.y1 + box.y2) / 2 - totalBlockHeight / 2 + lineHeight / 2;

  lines.forEach((l, idx) => {
    ctx.fillText(l, centerX, startY + idx * lineHeight);
  });
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

  // Edit / Add Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JuryMentorAdminEntry | null>(null);
  const [formRole, setFormRole] = useState<"jury" | "mentor">("jury");
  const [formName, setFormName] = useState("");
  const [formDesignation, setFormDesignation] = useState("");
  const [formBio, setFormBio] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [isPhotoChanged, setIsPhotoChanged] = useState(false);

  // Cropper states
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawPhoto, setRawPhoto] = useState<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Poster Canvas in modal
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [posterRendering, setPosterRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");

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

  // Open Modal for Add
  function handleOpenAdd() {
    setEditingEntry(null);
    setFormRole("jury");
    setFormName("");
    setFormDesignation("");
    setFormBio("");
    setPhotoUrl("");
    setIsPhotoChanged(false);
    setFormError("");
    setSaveSuccessMsg("");
    setModalOpen(true);
  }

  // Open Modal for Edit (preserves specific entry ID)
  function handleOpenEdit(entry: JuryMentorAdminEntry) {
    setEditingEntry(entry);
    setFormRole(entry.role);
    setFormName(entry.name);
    setFormDesignation(entry.designation);
    setFormBio(entry.bio || "");
    setPhotoUrl(entry.original_photo_url || "");
    setIsPhotoChanged(false);
    setFormError("");
    setSaveSuccessMsg("");
    setModalOpen(true);
  }

  // Handle Photo File selection
  function handleFileSelect(file: File | undefined | null) {
    if (!file) return;
    setFormError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFormError("Only JPG, PNG and WebP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError("Image is too large. Maximum size is 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawPhoto(reader.result as string);
      setCropModalOpen(true);
    };
    reader.readAsDataURL(file);
  }

  // Init Cropper
  useEffect(() => {
    if (!cropModalOpen || !rawPhoto || !cropImgRef.current) return;
    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }
    const cropper = new Cropper(cropImgRef.current, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.85,
      responsive: true,
      background: false,
      center: true,
      guides: true,
      highlight: false,
      zoomable: true,
      rotatable: true,
    });
    cropperRef.current = cropper;
    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [cropModalOpen, rawPhoto]);

  function handleApplyCrop() {
    if (!cropperRef.current) return;
    const canvas = cropperRef.current.getCroppedCanvas({
      width: 600,
      height: 600,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    setPhotoUrl(canvas.toDataURL("image/png"));
    setIsPhotoChanged(true);
    setCropModalOpen(false);
  }

  // Draw Poster Live on Modal Canvas
  const renderModalPoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setPosterRendering(true);
    try {
      if (document.fonts) {
        try {
          await Promise.all([
            document.fonts.load("800 36px 'Montserrat'"),
            document.fonts.load("700 28px 'Montserrat'"),
            document.fonts.load("800 36px 'Poppins'"),
            document.fonts.load("700 28px 'Poppins'"),
          ]);
        } catch {}
      }

      const config = formRole === "jury" ? CONFIG.jury : CONFIG.mentor;
      const templateImg = await getCachedImage(config.template);

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(templateImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      if (photoUrl) {
        const userImg = await loadImage(photoUrl);
        const radius = config.photo.diameter / 2;
        const { cx, cy } = config.photo;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        const aspect = userImg.width / userImg.height;
        let dw = radius * 2;
        let dh = radius * 2;
        let dx = cx - radius;
        let dy = cy - radius;

        if (userImg.width > userImg.height) {
          dw = dh * aspect;
          dx = cx - dw / 2;
        } else {
          dh = dw / aspect;
          dy = cy - dh / 2;
        }
        ctx.drawImage(userImg, dx, dy, dw, dh);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = formRole === "jury" ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.9)";
        ctx.stroke();
        ctx.restore();
      }

      const displayName = formName.trim();
      const displayDesig = formDesignation.trim();

      if (formRole === "jury") {
        if (displayName) {
          renderFittedText(ctx, displayName, CONFIG.jury.nameBox, {
            color: CONFIG.jury.nameColor,
            weight: 800,
            startSize: 34,
            minSize: 18,
            maxLines: 2,
          });
        }
        if (displayDesig) {
          renderFittedText(ctx, displayDesig, CONFIG.jury.desigBox, {
            color: CONFIG.jury.desigColor,
            weight: 700,
            startSize: 20,
            minSize: 13,
            maxLines: 2,
            lineHeightMultiplier: 1.1,
          });
        }
      } else {
        if (displayName) {
          renderFittedText(ctx, displayName, CONFIG.mentor.nameBox, {
            color: CONFIG.mentor.nameColor,
            weight: 800,
            startSize: 36,
            minSize: 18,
            maxLines: 2,
          });
        }
        if (displayDesig) {
          renderFittedText(ctx, displayDesig, CONFIG.mentor.desigBox, {
            color: CONFIG.mentor.desigColor,
            weight: 700,
            startSize: 24,
            minSize: 15,
            maxLines: 2,
          });
        }
      }
    } catch (err) {
      console.error("Poster render error:", err);
    } finally {
      setPosterRendering(false);
    }
  }, [formRole, photoUrl, formName, formDesignation]);

  useEffect(() => {
    if (modalOpen) {
      const timer = setTimeout(() => {
        void renderModalPoster();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [modalOpen, renderModalPoster]);

  // Fast Save / Update Handler
  async function handleSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaveSuccessMsg("");

    if (!formName.trim()) {
      setFormError("Full Name is required.");
      return;
    }
    if (!formDesignation.trim()) {
      setFormError("Designation / Organisation is required.");
      return;
    }
    if (!photoUrl) {
      setFormError("Please upload a profile photo.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setFormError("Poster canvas not ready.");
      return;
    }

    setSaving(true);
    try {
      // Export poster as efficient JPEG (0.88 quality, ~250KB) to ensure rapid network transfer
      const posterDataUrl = canvas.toDataURL("image/jpeg", 0.88);

      // Only send base64 photo if it was newly cropped/changed; otherwise send existing URL
      const photoPayload = isPhotoChanged ? photoUrl : photoUrl;

      const payload: Record<string, any> = {
        role: formRole,
        name: formName.trim(),
        designation: formDesignation.trim(),
        bio: formBio.trim(),
        original_photo: photoPayload,
        poster_image: posterDataUrl,
      };

      // SAFEGUARD: Pass entry ID strictly when editing so ONLY that row is updated
      if (editingEntry?.id) {
        payload.id = editingEntry.id;
        payload.identifier = editingEntry.identifier;
      }

      const res = await fetch("/api/admin/jury-mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save entry");
      }

      const savedEntry: JuryMentorAdminEntry = data.entry;

      // Update state without wiping other records
      if (editingEntry) {
        setEntries((prev) =>
          prev.map((e) => (String(e.id) === String(savedEntry.id) ? savedEntry : e))
        );
      } else {
        setEntries((prev) => [savedEntry, ...prev]);
      }

      setSaveSuccessMsg(editingEntry ? "Entry updated successfully!" : "New entry added successfully!");
      setTimeout(() => {
        setModalOpen(false);
      }, 700);
    } catch (err: any) {
      setFormError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // Delete Action
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
      // Safeguard: Filter out ONLY target ID
      setEntries((prev) => prev.filter((e) => String(e.id) !== String(id)));
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

  function handleDownloadModalCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = formName.trim().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "spotlight";
      a.download = `tricity_${formRole}_${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = e.name.toLowerCase().includes(q);
        const matchDesig = e.designation.toLowerCase().includes(q);
        const matchBio = e.bio?.toLowerCase().includes(q);
        const matchId = e.identifier.toLowerCase().includes(q);
        if (!matchName && !matchDesig && !matchBio && !matchId) return false;
      }
      return true;
    });
  }, [entries, roleFilter, search]);

  const juryCount = entries.filter((e) => e.role === "jury").length;
  const mentorCount = entries.filter((e) => e.role === "mentor").length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Header & Actions ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2">
            <span>⚖️💡</span>
            <span>Jury &amp; Mentors Spotlight Directory</span>
          </h2>
          <p className="text-xs text-slate-500 font-display">
            Manage submissions, edit profiles, generate custom posters, and download high-resolution graphics.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handleOpenAdd}
            className="btn-primary text-xs py-2 px-4 cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <span>+</span> Add Jury / Mentor
          </button>
          <button
            type="button"
            onClick={fetchEntries}
            className="btn-secondary text-xs py-2 px-3.5 cursor-pointer flex items-center gap-1.5"
            title="Refresh list"
          >
            <span>↻</span> Refresh
          </button>
        </div>
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
            type="button"
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
            type="button"
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
            type="button"
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
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-4 btn-primary text-xs py-2 px-4 cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>+</span> Add First Member
          </button>
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
                        {entry.bio && (
                          <span className="block text-[11px] font-normal text-slate-400 truncate max-w-xs">
                            {entry.bio}
                          </span>
                        )}
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
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(entry)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors cursor-pointer"
                            title="Edit profile & poster"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>

                          {/* Download PNG Button */}
                          <button
                            type="button"
                            onClick={() => handleDownload(entry)}
                            className="btn-primary text-[11px] py-1.5 px-2.5 inline-flex items-center gap-1 cursor-pointer"
                            title="Download poster PNG"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>PNG</span>
                          </button>

                          {/* Delete Button */}
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

      {/* ── ADD / EDIT MODAL ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/80 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-2xl p-5 sm:p-6 shadow-2xl border border-slate-200 my-auto flex flex-col max-h-[95vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">{editingEntry ? "✏️" : "✨"}</span>
                <div>
                  <h3 className="font-heading font-bold text-base text-slate-900">
                    {editingEntry ? `Edit Spotlight Profile: ${editingEntry.name}` : "Add New Jury or Mentor"}
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {editingEntry ? `Record ID: ${editingEntry.id} · Updates only this entry` : "Creates a new independent spotlight record"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto py-4 space-y-5 flex-1 pr-1">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                  ⚠️ {formError}
                </div>
              )}
              {saveSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono">
                  ✓ {saveSuccessMsg}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Form Inputs (Left side) */}
                <form id="admin-jury-form" onSubmit={handleSaveEntry} className="lg:col-span-7 space-y-4">
                  {/* Role Selection */}
                  <div>
                    <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setFormRole("jury")}
                        className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between ${
                          formRole === "jury"
                            ? "border-amber-500 bg-amber-50/70 shadow-xs"
                            : "border-slate-200 hover:border-amber-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">⚖️</span>
                          <span className="font-heading font-bold text-sm text-slate-900">Jury Member</span>
                        </div>
                        {formRole === "jury" && <span className="text-amber-600 font-bold text-xs">✓</span>}
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormRole("mentor")}
                        className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between ${
                          formRole === "mentor"
                            ? "border-emerald-500 bg-emerald-50/70 shadow-xs"
                            : "border-slate-200 hover:border-emerald-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">💡</span>
                          <span className="font-heading font-bold text-sm text-slate-900">Mentor</span>
                        </div>
                        {formRole === "mentor" && <span className="text-emerald-600 font-bold text-xs">✓</span>}
                      </button>
                    </div>
                  </div>

                  {/* Name and Designation */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                        Full Name on Poster <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="e.g. Dr. Rajesh Sharma"
                        className="input-field text-xs font-display"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                        Designation / Org <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formDesignation}
                        onChange={(e) => setFormDesignation(e.target.value)}
                        placeholder="e.g. CTO, NextGen AI"
                        className="input-field text-xs font-display"
                      />
                    </div>
                  </div>

                  {/* Bio / Description */}
                  <div>
                    <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1">
                      Bio / Remarks <span className="text-slate-400 font-normal lowercase">(optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={formBio}
                      onChange={(e) => setFormBio(e.target.value)}
                      placeholder="Brief background or achievements..."
                      className="input-field text-xs font-display resize-none"
                    />
                  </div>

                  {/* Profile Photo Upload */}
                  <div>
                    <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                      Profile Picture <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => handleFileSelect(e.target.files?.[0])}
                      className="hidden"
                    />

                    {photoUrl ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                        <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-emerald-500 shadow-2xs shrink-0 bg-white">
                          <img src={photoUrl} alt="Photo preview" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-mono font-bold text-slate-800 block truncate">
                            {isPhotoChanged ? "New photo cropped ✓" : "Current profile photo"}
                          </span>
                          <span className="text-[11px] text-slate-500 font-display">
                            Auto-rendered into circle frame
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-secondary text-[11px] py-1.5 px-2.5 cursor-pointer"
                          >
                            Replace
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full p-5 rounded-xl border-2 border-dashed border-slate-300 hover:border-teal-500 bg-slate-50 hover:bg-teal-50/30 text-center cursor-pointer transition-colors"
                      >
                        <span className="text-xl block mb-1">📷</span>
                        <span className="text-xs font-heading font-bold text-slate-800 block">
                          Upload Profile Photo
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">JPG, PNG, WebP up to 5 MB</span>
                      </button>
                    )}
                  </div>
                </form>

                {/* Poster Live Canvas (Right side) */}
                <div className="lg:col-span-5 flex flex-col items-center">
                  <div className="relative w-full max-w-[270px] sm:max-w-[310px] bg-slate-100 p-2 rounded-xl border border-slate-200 shadow-md">
                    {posterRendering && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs rounded-xl flex items-center justify-center gap-2 z-10">
                        <div className="w-6 h-6 rounded-full border-2 border-teal-200 border-t-teal-700 animate-spin" />
                        <span className="font-mono text-[10px] text-slate-700 uppercase font-bold">Rendering...</span>
                      </div>
                    )}
                    <canvas
                      ref={canvasRef}
                      width={CANVAS_WIDTH}
                      height={CANVAS_HEIGHT}
                      className="w-full h-auto rounded-lg shadow-sm border border-slate-300 block bg-white aspect-[1080/1350]"
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-3 w-full max-w-[270px] sm:max-w-[310px]">
                    <button
                      type="button"
                      onClick={handleDownloadModalCanvas}
                      disabled={!photoUrl}
                      className="btn-secondary text-xs py-2 px-3 w-full flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Download full poster"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      <span>Download Poster</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] font-mono text-slate-400">
                {editingEntry ? "Edit Mode: Update Target Row Only" : "New Mode: Insert New Row"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="btn-secondary text-xs py-2 px-4 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  form="admin-jury-form"
                  disabled={saving || !formName.trim() || !formDesignation.trim() || !photoUrl}
                  className="btn-primary text-xs py-2 px-5 flex items-center gap-2 cursor-pointer shadow-xs !bg-teal-700 hover:!bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Saving Entry...</span>
                    </>
                  ) : (
                    <span>{editingEntry ? "✓ Save Changes" : "✓ Add to Directory"}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CROP MODAL ── */}
      {cropModalOpen && rawPhoto && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">✂️</span>
                <h3 className="font-heading font-bold text-base text-slate-900">Crop Face for Poster</h3>
              </div>
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative w-full h-80 bg-slate-900 rounded-xl overflow-hidden my-3 flex items-center justify-center">
              <img ref={cropImgRef} src={rawPhoto} alt="To crop" className="max-h-full max-w-full block" />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-slate-400">1:1 Square Ratio</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCropModalOpen(false)}
                  className="btn-secondary text-xs py-2 px-4 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  className="btn-primary text-xs py-2 px-5 cursor-pointer shadow-xs"
                >
                  Apply Crop ✓
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── POSTER FULL PREVIEW MODAL ── */}
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
            <h3 className="font-heading font-bold text-lg text-slate-900 mb-1">Delete Entry?</h3>
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
