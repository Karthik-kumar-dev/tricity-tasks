"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

export type RoleType = "jury" | "mentor";

interface ExistingEntry {
  id: string;
  role: RoleType;
  name: string;
  designation: string;
  original_photo_url: string;
  poster_url: string;
  identifier: string;
  created_at: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1350;

// Coordinates & layout specification
const CONFIG = {
  jury: {
    template: "/posters/jury.png",
    photo: { cx: 808, cy: 605, diameter: 330 },
    // Name inside yellow band below circle: x 604 to 1036, y 755 to 835 (Center X=820, Y=795)
    nameBox: { x1: 604, x2: 1036, y1: 755, y2: 835, padding: 16 },
    // Designation/Organisation inside white box below yellow band: x 685 to 915, y 842 to 885 (Center X=800, Y=863.5)
    desigBox: { x1: 685, x2: 915, y1: 842, y2: 885, padding: 10 },
    nameColor: "#11291f",
    desigColor: "#0b3d2c",
  },
  mentor: {
    template: "/posters/mentor.png",
    photo: { cx: 820, cy: 350, diameter: 370 },
    // Name in dark green band: x 630 to 1030, y 535 to 610. White bold text, centered.
    nameBox: { x1: 630, x2: 1030, y1: 535, y2: 610, padding: 16 },
    // Designation/Organisation in yellow pill: x 670 to 980, y 615 to 680. Dark green text, centered.
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

function getOrCreateDeviceIdentifier(): string {
  if (typeof window === "undefined") return "guest";
  const cookies = document.cookie.split("; ").reduce((acc, c) => {
    const [key, ...val] = c.split("=");
    acc[key] = decodeURIComponent(val.join("="));
    return acc;
  }, {} as Record<string, string>);

  if (cookies.team_id) {
    return cookies.team_id;
  }

  let deviceId = localStorage.getItem("jury_mentor_device_id");
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    localStorage.setItem("jury_mentor_device_id", deviceId);
  }
  return deviceId;
}

export default function JuryMentorFlow() {
  const [role, setRole] = useState<RoleType>("mentor");
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [rawPhoto, setRawPhoto] = useState<string | null>(null);
  const [croppedPhoto, setCroppedPhoto] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Flow & UI states
  const [hasExistingEntry, setHasExistingEntry] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [posterRendering, setPosterRendering] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const [posterError, setPosterError] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState("");
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const redrawTimerRef = useRef<number | null>(null);

  // 1. Check existing submission by identifier
  useEffect(() => {
    const id = getOrCreateDeviceIdentifier();
    fetch(`/api/jury-mentors?identifier=${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.entry) {
          setHasExistingEntry(true);
          setHasSaved(true);
          setRole(data.entry.role);
          setName(data.entry.name);
          setDesignation(data.entry.designation);
          setCroppedPhoto(data.entry.original_photo_url || null);
        }
      })
      .catch((err) => console.error("Error loading existing jury/mentor entry:", err))
      .finally(() => setLoadingInitial(false));
  }, []);

  // 2. Handle File Upload
  function validateAndOpen(file: File | undefined | null) {
    setFormError("");
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFormError("Only JPG, PNG and WebP images are allowed.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError("Image is too large. Maximum size is 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setRawPhoto(dataUrl);
      setCropModalOpen(true);
    };
    reader.onerror = () => setFormError("Could not read image file.");
    reader.readAsDataURL(file);
  }

  // 3. Init Cropper.js
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
      toggleDragModeOnDblclick: false,
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
    setCroppedPhoto(canvas.toDataURL("image/png"));
    setHasSaved(false);
    setCropModalOpen(false);
  }

  function handleReCrop() {
    if (!rawPhoto && !croppedPhoto) return;
    setCropModalOpen(true);
  }

  function handleRemovePhoto() {
    setCroppedPhoto(null);
    setRawPhoto(null);
    setHasSaved(false);
  }

  // 4. Text Fitting Helper
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

    // Try 1 line
    while (fontSize >= minSize) {
      ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
      if (ctx.measureText(rawContent).width <= availableWidth) {
        lines = [rawContent];
        break;
      }
      fontSize -= 1;
    }

    // Try wrapping to 2 lines
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

  // 5. Draw Poster Live onto HTML Canvas
  const renderPoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setPosterRendering(true);
    setPosterError("");

    try {
      if (document.fonts) {
        try {
          await Promise.all([
            document.fonts.load("800 36px 'Montserrat'"),
            document.fonts.load("700 28px 'Montserrat'"),
            document.fonts.load("600 24px 'Montserrat'"),
            document.fonts.load("800 36px 'Poppins'"),
            document.fonts.load("700 28px 'Poppins'"),
          ]);
        } catch {
          // ignore font load failure
        }
      }

      const config = role === "jury" ? CONFIG.jury : CONFIG.mentor;
      const templateImg = await getCachedImage(config.template);

      // Clear & Draw base poster template
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.drawImage(templateImg, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // If user provided a photo, draw circle mask and fit-to-cover photo
      if (croppedPhoto) {
        const userImg = await loadImage(croppedPhoto);
        const radius = config.photo.diameter / 2;
        const { cx, cy } = config.photo;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Fit to cover circle
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

        // Clean white/gold ring border around photo
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = role === "jury" ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.9)";
        ctx.stroke();
        ctx.restore();
      }

      // Draw Name and Designation text
      const displayName = name.trim();
      const displayDesig = designation.trim();

      if (role === "jury") {
        // Name inside yellow band (x: 604-1036, y: 755-835)
        if (displayName) {
          renderFittedText(ctx, displayName, CONFIG.jury.nameBox, {
            color: CONFIG.jury.nameColor,
            weight: 800,
            startSize: 34,
            minSize: 18,
            maxLines: 2,
          });
        }
        // Designation/Organisation inside white box below yellow band (x: 685-915, y: 842-885)
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
        // Mentor poster:
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

      setPosterReady(true);
    } catch (err: any) {
      console.error("Poster render error:", err);
      setPosterError(err.message || "Failed to render poster");
      setPosterReady(false);
    } finally {
      setPosterRendering(false);
    }
  }, [role, croppedPhoto, name, designation]);

  // Debounced auto-render on input changes (like Task 1)
  useEffect(() => {
    if (redrawTimerRef.current !== null) {
      window.clearTimeout(redrawTimerRef.current);
    }
    redrawTimerRef.current = window.setTimeout(() => {
      void renderPoster();
    }, 100);
    return () => {
      if (redrawTimerRef.current !== null) {
        window.clearTimeout(redrawTimerRef.current);
      }
    };
  }, [renderPoster]);

  // 6. Download Poster directly from Canvas
  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeRole = role || "vip";
      const safeName = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "spotlight";
      a.download = `tricity_${safeRole}_${safeName}_poster.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // 7. Save / Submit Flow with Confirmation
  function handleOpenSaveConfirm(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setFormError("");

    if (!role) {
      setFormError("Please select Jury or Mentor.");
      return;
    }
    if (!name.trim()) {
      setFormError("Full Name is required.");
      return;
    }
    if (!designation.trim()) {
      setFormError("Designation / Organisation is required.");
      return;
    }
    if (!croppedPhoto) {
      setFormError("Please upload and crop your profile photo.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setFormError("Poster canvas not ready.");
      return;
    }

    setConfirmSaveOpen(true);
  }

  async function executeSaveSubmission() {
    setFormError("");
    const canvas = canvasRef.current;
    if (!canvas) {
      setFormError("Poster canvas not ready.");
      return;
    }

    setSaving(true);
    try {
      const posterDataUrl = canvas.toDataURL("image/png");
      const identifier = getOrCreateDeviceIdentifier();

      const res = await fetch("/api/jury-mentors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          name: name.trim(),
          designation: designation.trim(),
          original_photo: croppedPhoto,
          poster_image: posterDataUrl,
          identifier,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save submission");
      }

      setHasExistingEntry(true);
      setHasSaved(true);
      setConfirmSaveOpen(false);
      setSubmitSuccess(true);
      setIsEditMode(false);
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err: any) {
      setFormError(err.message || "Failed to save poster.");
    } finally {
      setSaving(false);
    }
  }

  // 8. Share Action
  async function handleShare() {
    const roleTitle = role === "jury" ? "Jury Member" : "Mentor";
    const shareText = `Honored to be a ${roleTitle} at the TRI-CITY AI-THON 2026! 🚀 Connect with creators, innovators, and builders across Warangal, Hanamkonda & Kazipet.`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "https://centle.in/tricity";

    const canvas = canvasRef.current;
    if (navigator.share && canvas) {
      try {
        canvas.toBlob(async (blob) => {
          if (blob && navigator.canShare) {
            const file = new File([blob], `${role}_poster.png`, { type: "image/png" });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                title: `Tri-City AI-Thon 2026 — ${roleTitle} Spotlight`,
                text: shareText,
                files: [file],
              });
              return;
            }
          }
          await navigator.share({
            title: `Tri-City AI-Thon 2026 — ${roleTitle} Spotlight`,
            text: shareText,
            url: shareUrl,
          });
        }, "image/png");
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setShareModalOpen(true);
        }
        return;
      }
    }

    setShareModalOpen(true);
  }

  function handleCopyShareLink() {
    const url = typeof window !== "undefined" ? window.location.href : "https://centle.in/tricity";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2500);
      });
    }
  }

  if (loadingInitial) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full border-3 border-teal-200 border-t-teal-700 animate-spin" />
        <span className="font-mono text-xs uppercase tracking-wider text-slate-500">
          Loading Jury &amp; Mentor Portal...
        </span>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* ── STEP 1: Role Selection ── */}
      <section className="pro-card rounded-2xl p-6 sm:p-7 bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            1
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">
            Select Your Role
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Jury Member Button */}
          <button
            type="button"
            onClick={() => {
              setRole("jury");
              setHasSaved(false);
            }}
            className={`p-5 rounded-xl border-2 text-left transition-all cursor-pointer relative overflow-hidden group ${
              role === "jury"
                ? "border-amber-500 bg-amber-50/60 shadow-md ring-2 ring-amber-500/20"
                : "border-slate-200 hover:border-amber-400 bg-white hover:bg-amber-50/20"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl p-2 rounded-lg bg-amber-100 text-amber-800">
                ⚖️
              </span>
              {role === "jury" && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  ✓
                </span>
              )}
            </div>
            <h4 className="font-heading font-bold text-base text-slate-900 mb-1">
              Jury Member
            </h4>
            <p className="text-xs text-slate-500 font-display">
              &ldquo;Meet Our Jury Member&rdquo; poster with yellow band coordinate placement.
            </p>
          </button>

          {/* Mentor Button */}
          <button
            type="button"
            onClick={() => {
              setRole("mentor");
              setHasSaved(false);
            }}
            className={`p-5 rounded-xl border-2 text-left transition-all cursor-pointer relative overflow-hidden group ${
              role === "mentor"
                ? "border-emerald-500 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20"
                : "border-slate-200 hover:border-emerald-400 bg-white hover:bg-emerald-50/20"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl p-2 rounded-lg bg-emerald-100 text-emerald-800">
                💡
              </span>
              {role === "mentor" && (
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                  ✓
                </span>
              )}
            </div>
            <h4 className="font-heading font-bold text-base text-slate-900 mb-1">
              Mentor
            </h4>
            <p className="text-xs text-slate-500 font-display">
              &ldquo;Meet Our Mentor&rdquo; poster with dark green title bar and yellow pill badge.
            </p>
          </button>
        </div>
      </section>

      {/* ── STEP 2: Profile Picture & Details ── */}
      <section className="pro-card rounded-2xl p-6 sm:p-7 bg-white border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            2
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">
            Profile Photo &amp; Details
          </h3>
        </div>

        {/* Inputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
              Full Name on Poster <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setHasSaved(false);
              }}
              placeholder="e.g. Dr. Rajesh Sharma"
              className="input-field text-sm font-display"
            />
          </div>

          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
              Designation / Organisation <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={designation}
              onChange={(e) => {
                setDesignation(e.target.value);
                setHasSaved(false);
              }}
              placeholder="e.g. CTO, NextGen AI | Ex-Google"
              className="input-field text-sm font-display"
            />
          </div>
        </div>

        {/* Photo Upload Area */}
        <div>
          <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
            Profile Picture <span className="text-red-500">*</span>{" "}
            <span className="text-slate-400 font-normal lowercase">(JPG, PNG, WebP · Max 5 MB)</span>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => validateAndOpen(e.target.files?.[0])}
            className="hidden"
          />

          {croppedPhoto ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full overflow-hidden border-3 border-emerald-400 shadow-sm shrink-0 bg-white">
                  <img
                    src={croppedPhoto}
                    alt="Cropped face"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-800 mb-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Face Centered &amp; Placed On Poster
                  </div>
                  <p className="text-xs text-slate-600 font-display">
                    Your photo is rendered live into the circular frame below.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReCrop}
                  className="btn-primary text-xs py-2 px-3.5 cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span>Re-Crop Face</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary text-xs py-2 px-3 cursor-pointer"
                >
                  Change Photo
                </button>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="btn-ghost text-xs py-2 px-2.5 text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="Remove photo"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                validateAndOpen(e.dataTransfer.files?.[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all ${
                dragging
                  ? "border-teal-600 bg-teal-50"
                  : "border-slate-300 bg-slate-50/70 hover:border-teal-500 hover:bg-teal-50/40"
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-slate-500 flex items-center justify-center mx-auto mb-3 text-2xl shadow-2xs">
                📷
              </div>
              <h4 className="font-heading font-bold text-sm text-slate-800 mb-1">
                Click or Drop Profile Photo Here
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto font-display">
                JPG, PNG or WebP up to 5 MB. You can crop, zoom and rotate your face after selecting.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── STEP 3: LIVE POSTER PREVIEW (LIKE TASK 1) ── */}
      <section className="pro-card rounded-2xl p-6 sm:p-7 bg-white border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
              3
            </span>
            <div>
              <h3 className="font-heading font-bold text-lg text-slate-900">
                Live Poster Preview ({role === "jury" ? "Jury Member" : "Mentor"})
              </h3>
              <p className="text-xs text-slate-500 font-display">
                Auto-updates in real time as you crop your photo or edit your details.
              </p>
            </div>
          </div>

          {croppedPhoto && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE PREVIEW READY
            </div>
          )}
        </div>

        {posterError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
            ⚠️ {posterError}
          </div>
        )}

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Canvas Display */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="relative w-full max-w-[390px] bg-slate-900/5 p-3 rounded-2xl border border-slate-200 shadow-lg">
              {/* Spinner while rendering */}
              {posterRendering && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center gap-2 z-10">
                  <div className="w-8 h-8 rounded-full border-3 border-teal-200 border-t-teal-700 animate-spin" />
                  <span className="font-mono text-[11px] font-bold text-slate-700 uppercase">
                    Updating Poster...
                  </span>
                </div>
              )}

              {/* The 1080x1350 canvas */}
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                className="w-full h-auto rounded-xl shadow-md border border-slate-300 block bg-white aspect-[1080/1350]"
              />
            </div>

            {!croppedPhoto && (
              <p className="text-xs text-slate-500 font-display mt-3 text-center">
                👆 Upload your profile photo above to see your face in the official circle frame!
              </p>
            )}

            <p className="text-[11px] font-mono text-slate-400 mt-2 text-center">
              Target resolution: 1080 × 1350 px (Instagram / LinkedIn format)
            </p>
          </div>

          {/* Quick Actions & Submission Panel */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <h4 className="font-heading font-bold text-base text-slate-900 flex items-center gap-2">
                <span>⚡</span> Quick Actions
              </h4>

              {!hasSaved ? (
                <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span className="text-base">🔒</span>
                    <span>Download Locked</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-display">
                    Please click <strong>&ldquo;Save to Official Directory&rdquo;</strong> below to register your spotlight and unlock your high-resolution poster download.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-bold">✓ Official Entry Registered — Download Unlocked!</span>
                </div>
              )}

              {/* Download PNG Button */}
              {hasSaved ? (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!croppedPhoto}
                  className="w-full btn-primary text-xs py-3.5 px-4 flex items-center justify-center gap-2 shadow-md cursor-pointer !bg-emerald-600 hover:!bg-emerald-700 animate-fadeIn"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="font-bold">Download Poster (PNG)</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-3 px-4 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 text-xs font-mono font-bold uppercase tracking-wider cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Download Locked (Save Required)</span>
                </button>
              )}

              {/* Share Poster Button */}
              <button
                type="button"
                onClick={handleShare}
                disabled={!hasSaved || !croppedPhoto}
                className={`w-full btn-secondary text-xs py-3 px-4 flex items-center justify-center gap-2 border-teal-200 bg-teal-50/70 text-teal-800 hover:bg-teal-100 ${
                  !hasSaved || !croppedPhoto ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>Share On Social Media</span>
              </button>

              {croppedPhoto && (
                <button
                  type="button"
                  onClick={handleReCrop}
                  className="w-full py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span>Re-Crop &amp; Adjust Face</span>
                </button>
              )}
            </div>

            {/* Submit & Save to Event Database */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
              <div>
                <h4 className="font-heading font-bold text-sm text-slate-900 mb-1 flex items-center gap-1.5">
                  <span>💾</span>
                  <span>Save to Official Directory</span>
                </h4>
                <p className="text-xs text-slate-500 font-display leading-relaxed">
                  Registers your spotlight entry into the tournament roster. You will be prompted to confirm your details before saving.
                </p>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                  ⚠️ {formError}
                </div>
              )}

              {submitSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2">
                  <span>✓</span>
                  <span>Spotlight entry successfully saved! Poster download unlocked.</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleOpenSaveConfirm()}
                disabled={saving || !croppedPhoto || !name.trim() || !designation.trim()}
                className={`w-full py-3.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs ${
                  saving || !croppedPhoto || !name.trim() || !designation.trim()
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : hasSaved
                    ? "bg-teal-700 hover:bg-teal-800 text-white cursor-pointer active:scale-98"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98 animate-pulse"
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Saving Entry...</span>
                  </>
                ) : hasSaved ? (
                  <>
                    <span>✓ Saved to Directory (Click to Re-save)</span>
                  </>
                ) : (
                  <>
                    <span>Save to Official Directory →</span>
                  </>
                )}
              </button>

              {hasExistingEntry && (
                <div className="text-[11px] font-mono text-emerald-700 text-center">
                  ✓ You have a registered submission. Edits will update your existing poster.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── CROP MODAL ── */}
      {cropModalOpen && rawPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">✂️</span>
                <h3 className="font-heading font-bold text-base text-slate-900">
                  Center &amp; Crop Face
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 my-2 font-display">
              Drag, zoom, and center your face inside the crop box. It will automatically be rendered live onto your {role} poster!
            </p>

            <div className="relative w-full h-80 bg-slate-900 rounded-xl overflow-hidden my-2 flex items-center justify-center">
              <img
                ref={cropImgRef}
                src={rawPhoto}
                alt="Source to crop"
                className="max-h-full max-w-full block"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono text-slate-400">
                1:1 Aspect Ratio (Square/Circle)
              </span>
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

      {/* ── SAVE CONFIRMATION MODAL ── */}
      {confirmSaveOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-7 shadow-2xl border border-slate-200 flex flex-col space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center text-lg">
                  📋
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-slate-900">
                    Confirm Official Registration
                  </h3>
                  <p className="text-[11px] font-mono text-slate-500">
                    Tri-City Hackathon 2026 Directory
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmSaveOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-mono text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-3">
                {croppedPhoto ? (
                  <img
                    src={croppedPhoto}
                    alt="Photo preview"
                    className="w-14 h-14 rounded-full object-cover border-2 border-emerald-500 shadow-xs shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                    👤
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 mb-1">
                    {role === "jury" ? "⚖️ Jury Member" : "💡 Mentor"}
                  </span>
                  <h4 className="font-heading font-bold text-sm text-slate-900 truncate">
                    {name.trim()}
                  </h4>
                  <p className="text-xs text-slate-600 truncate font-display">
                    {designation.trim()}
                  </p>
                </div>
              </div>

              <div className="text-[11px] font-display text-slate-600 pt-2 border-t border-slate-200 leading-relaxed">
                Are you sure you want to save this to the official directory? Saving registers your spotlight profile and immediately unlocks your official high-resolution poster download.
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                ⚠️ {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmSaveOpen(false)}
                disabled={saving}
                className="btn-secondary text-xs py-2 px-4 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSaveSubmission}
                disabled={saving}
                className="btn-primary text-xs py-2.5 px-5 !bg-emerald-600 hover:!bg-emerald-700 cursor-pointer shadow-sm flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>✓ Yes, Confirm &amp; Save</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHARE MODAL ── */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-7 shadow-2xl border border-slate-200">
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 text-lg font-mono cursor-pointer"
            >
              ✕
            </button>

            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center text-2xl mb-4">
              📢
            </div>

            <h3 className="font-heading font-bold text-xl text-slate-900 mb-1">
              Share Spotlight Poster
            </h3>
            <p className="text-xs text-slate-600 mb-5 font-display leading-relaxed">
              Share your participation at TRI-CITY AI-THON 2026 across social media!
            </p>

            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `I am proud to be a ${role === "jury" ? "Jury Member" : "Mentor"} at TRI-CITY AI-THON 2026! https://centle.in/tricity`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold hover:bg-emerald-100 transition-colors"
              >
                <span>💬</span> WhatsApp
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
                  "https://centle.in/tricity"
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-mono font-bold hover:bg-blue-100 transition-colors"
              >
                <span>💼</span> LinkedIn
              </a>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                  `Proud to be part of TRI-CITY AI-THON 2026 as a ${role === "jury" ? "Jury Member" : "Mentor"}! @CentleIndia #TriCityAIHackathon`
                )}&url=${encodeURIComponent("https://centle.in/tricity")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs font-mono font-bold hover:bg-slate-100 transition-colors"
              >
                <span>🐦</span> Twitter/X
              </a>
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-bold hover:bg-teal-100 transition-colors cursor-pointer"
              >
                <span>🔗</span> {copiedShare ? "Copied!" : "Copy Link"}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShareModalOpen(false)}
                className="btn-secondary text-xs py-2 px-5 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
