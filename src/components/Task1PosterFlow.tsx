"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";

/* ─────────────────────────────────────────────────────────────
   Config — tweak these to reposition text / photo on the poster
   ───────────────────────────────────────────────────────────── */
const POSTER = {
  width: 1080,
  height: 1350,
  // Same-origin asset so the canvas never hits CORS taint.
  templateSrc: "/tricity-poster-template.png",
  // Profile photo — circular, center (540, 340), diameter 270
  photo: { x: 540, y: 340, size: 270 },
  photoRingColor: "#ffffff",
  photoRingWidth: 5,
  // User name — bold, centered
  name: {
    x: 540,
    y: 502,
    maxWidth: 780,
    maxFontSize: 64,
    minFontSize: 20,
    color: "#1a3a5c",
    weight: 800,
  },
  // College name — semi-bold, centered
  college: {
    x: 540,
    y: 560,
    maxWidth: 780,
    maxFontSize: 34,
    minFontSize: 16,
    color: "#33506f",
    weight: 600,
  },
  fontFamily: '"Plus Jakarta Sans", sans-serif',
} as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CROP_SIZE = 540; // px output of the cropper (square, 1:1)
const POSTER_TASK_ID = 1;

// Accepts: https://www.linkedin.com/posts/... or /feed/update/...
const LINKEDIN_URL_RE = /^https:\/\/(www\.)?linkedin\.com\/(posts|feed\/update)\//i;

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
let templatePromise: Promise<HTMLImageElement> | null = null;

function loadTemplate(): Promise<HTMLImageElement> {
  if (!templatePromise) {
    templatePromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load the poster template"));
      img.src = POSTER.templateSrc;
    });
  }
  return templatePromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

async function ensureFonts(sample: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`800 64px ${POSTER.fontFamily}`, sample),
      document.fonts.load(`700 64px ${POSTER.fontFamily}`, sample),
      document.fonts.load(`600 34px ${POSTER.fontFamily}`, sample),
    ]);
  } catch {
    // Fonts are best-effort — fall back to system sans-serif.
  }
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  maxWidth: number,
  maxSize: number,
  minSize: number
): number {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${POSTER.fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minSize;
}

function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return slug || "participant";
}

function buildCaption(name: string, college: string, template?: string | null): string {
  const formattedName = toTitleCase(name) || "Student Innovator";
  const formattedCollege = college.trim() || "Your College";

  if (template && template.trim()) {
    return template
      .replace(/{name}/gi, formattedName)
      .replace(/{college}/gi, formattedCollege);
  }

  return [
    `I'm officially registered for the TRI-CITY AI HACKATHON 2026!`,
    ``,
    `Name : ${formattedName}`,
    `College : ${formattedCollege}`,
    `Where : Warangal · Hanamkonda · Kazipet`,
    `When : October 10 - 11, 2026 | 24-hour sprint`,
    ``,
    `My personal registration poster is ready. Pumped to build, learn and compete with the best minds across the tri-cities!`,
    ``,
    `#TriCityAIHackathon #CentleIndia #AIHackathon #Hackathon2026 #Warangal #Hanamkonda #Kazipet #Innovation #TechCommunity #StudentDevelopers`,
  ].join("\n");
}

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
interface Props {
  teamId: string;
  memberName: string; // cookie default
  collegeName: string; // cookie default
  rules?: string | null;
  customTemplate?: string | null;
}

export default function Task1PosterFlow({
  teamId,
  memberName,
  collegeName,
  rules,
  customTemplate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redrawTimerRef = useRef<number | null>(null);

  // Poster editor state
  const [name, setName] = useState(memberName);
  const [college, setCollege] = useState(collegeName);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [rawPhotoSrc, setRawPhotoSrc] = useState<string | null>(null);
  const [posterReady, setPosterReady] = useState(false);
  const [posterError, setPosterError] = useState("");

  // Upload state
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);

  // Crop modal state
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<Cropper | null>(null);
  const [zoom, setZoom] = useState(1);

  // Caption state
  const [copied, setCopied] = useState(false);

  // Submission state
  const [savedLink, setSavedLink] = useState<string | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [postUrl, setPostUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "done">("idle");

  const caption = useMemo(
    () => buildCaption(name, college, customTemplate),
    [name, college, customTemplate]
  );
  const hasPhoto = photoDataUrl !== null;

  /* ── Fetch existing submission ── */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks/${POSTER_TASK_ID}/status`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.submitted) return;
        setAlreadySubmitted(true);
        setSavedLink(data.link || null);
        setPostUrl(data.link || "");
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── Draw the poster whenever inputs change ── */
  const renderPoster = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      const template = await Promise.all([loadTemplate(), ensureFonts(name + college)]).then(
        ([t]) => t
      );

      ctx.clearRect(0, 0, POSTER.width, POSTER.height);
      ctx.drawImage(template, 0, 0, POSTER.width, POSTER.height);

      // Profile photo — circle clipped
      if (photoDataUrl) {
        const photo = await loadImage(photoDataUrl);
        const { x, y } = POSTER.photo;
        const r = POSTER.photo.size / 2;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(photo, x - r, y - r, POSTER.photo.size, POSTER.photo.size);
        ctx.restore();

        // Finishing ring around the photo
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.strokeStyle = POSTER.photoRingColor;
        ctx.lineWidth = POSTER.photoRingWidth;
        ctx.stroke();
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Name - First letter capital, remainder lowercase (Title Case)
      const nameText = toTitleCase(name);
      if (nameText) {
        const size = fitFont(
          ctx,
          nameText,
          POSTER.name.weight,
          POSTER.name.maxWidth,
          POSTER.name.maxFontSize,
          POSTER.name.minFontSize
        );
        ctx.font = `${POSTER.name.weight} ${size}px ${POSTER.fontFamily}`;
        ctx.fillStyle = POSTER.name.color;
        ctx.fillText(nameText, POSTER.name.x, POSTER.name.y);
      }

      // College
      const collegeText = college.trim();
      if (collegeText) {
        const size = fitFont(
          ctx,
          collegeText,
          POSTER.college.weight,
          POSTER.college.maxWidth,
          POSTER.college.maxFontSize,
          POSTER.college.minFontSize
        );
        ctx.font = `${POSTER.college.weight} ${size}px ${POSTER.fontFamily}`;
        ctx.fillStyle = POSTER.college.color;
        ctx.fillText(collegeText, POSTER.college.x, POSTER.college.y);
      }

      setPosterError("");
      setPosterReady(true);
    } catch (err) {
      setPosterError(err instanceof Error ? err.message : "Could not render the poster");
      setPosterReady(false);
    }
  }, [name, college, photoDataUrl]);

  useEffect(() => {
    if (redrawTimerRef.current !== null) {
      window.clearTimeout(redrawTimerRef.current);
    }
    redrawTimerRef.current = window.setTimeout(() => {
      void renderPoster();
    }, 120);
    return () => {
      if (redrawTimerRef.current !== null) {
        window.clearTimeout(redrawTimerRef.current);
      }
    };
  }, [name, college, photoDataUrl, renderPoster]);

  /* ── File upload ── */
  function validateAndOpen(file: File | undefined | null) {
    setUploadError("");
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Only JPG, PNG and WEBP images are allowed.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setUploadError("Image must be 5 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setRawPhotoSrc(dataUrl);
      setCropSrc(dataUrl);
      setZoom(1);
      setCropOpen(true);
    };
    reader.onerror = () => setUploadError("Could not read the selected image.");
    reader.readAsDataURL(file);
  }

  /* ── Crop modal: init cropper ── */
  useEffect(() => {
    if (!cropOpen || !cropSrc || !cropImgRef.current) return;

    if (cropperRef.current) {
      cropperRef.current.destroy();
      cropperRef.current = null;
    }

    const cropper = new Cropper(cropImgRef.current, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.7,
      responsive: true,
      background: false,
      center: true,
      guides: true,
      highlight: false,
      toggleDragModeOnDblclick: false,
      zoomable: true,
      rotatable: true,
      zoom(e) {
        const ratio = e.detail?.ratio;
        if (typeof ratio === "number") setZoom(Math.min(3, Math.max(0.1, ratio)));
      },
    });
    cropperRef.current = cropper;
    setZoom(1);

    return () => {
      cropper.destroy();
      cropperRef.current = null;
    };
  }, [cropOpen, cropSrc]);

  function applyCrop() {
    const cropper = cropperRef.current;
    if (!cropper) return;
    const out = cropper.getCroppedCanvas({ width: CROP_SIZE, height: CROP_SIZE });
    setPhotoDataUrl(out.toDataURL("image/png"));
    setCropOpen(false);
  }

  function cancelCrop() {
    setCropOpen(false);
  }

  function handleReCrop() {
    const source = rawPhotoSrc || photoDataUrl;
    if (!source) return;
    setCropSrc(source);
    setZoom(1);
    setCropOpen(true);
  }

  function handleRemovePhoto() {
    setPhotoDataUrl(null);
    setRawPhotoSrc(null);
    setCropSrc(null);
    setCropOpen(false);
  }

  /* ── Download ── */
  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas || !hasPhoto) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugifyName(toTitleCase(name))}-tricity-aithon-poster.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  /* ── Copy caption ── */
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = caption;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  /* ── Submit LinkedIn link ── */
  function validateLinkedInUrl(value: string): boolean {
    return LINKEDIN_URL_RE.test(value.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLinkError("");
    setSubmitError("");

    const url = postUrl.trim();
    if (!url) {
      setLinkError("Please paste the public URL of your LinkedIn post.");
      return;
    }
    if (!validateLinkedInUrl(url)) {
      setLinkError(
        "That doesn't look like a LinkedIn post URL. Use the format: https://www.linkedin.com/posts/... or https://www.linkedin.com/feed/update/..."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${POSTER_TASK_ID}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          member_name: memberName || name,
          college_name: collegeName || college,
          link: url,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Submission failed. Please try again.");
        return;
      }
      setAlreadySubmitted(true);
      setSavedLink(url);
      setEditingLink(false);
      setSubmitStatus("done");
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto grid gap-6">
      {/* ── 1. Upload profile photo ── */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            1
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">Upload Your Photo</h3>
        </div>

        <input
          type="file"
          id="poster-photo-input"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => validateAndOpen(e.target.files?.[0] ?? null)}
        />

        {hasPhoto ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="relative group shrink-0">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden ring-4 ring-emerald-200 border-2 border-white shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoDataUrl!} alt="Selected profile" className="w-full h-full object-cover" />
                </div>
                <button
                  type="button"
                  onClick={handleReCrop}
                  className="absolute inset-0 rounded-full bg-slate-900/60 text-white text-[11px] font-mono font-semibold opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  title="Click to re-crop"
                >
                  Edit Crop
                </button>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 text-xs font-mono font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                    ✓ Photo Ready
                  </span>
                  <span className="text-xs text-slate-500 font-display">Placed on poster</span>
                </div>
                <p className="text-xs text-slate-600 font-display leading-relaxed mb-3">
                  You can re-crop, adjust zoom, rotate, or change your photo at any time.
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                  <button
                    type="button"
                    onClick={handleReCrop}
                    className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-xs"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Crop &amp; Edit Photo</span>
                  </button>

                  <label
                    htmlFor="poster-photo-input"
                    className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Change Photo</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="btn-ghost text-xs py-2 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <label
            htmlFor="poster-photo-input"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              validateAndOpen(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors ${
              dragging
                ? "border-teal-600 bg-teal-50"
                : "border-slate-300 bg-slate-50/60 hover:border-teal-500 hover:bg-teal-50/40"
            }`}
          >
            <div className="w-14 h-14 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-700">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 16v-6m0 0l-3 3m3-3l3 3m-9 6a3 3 0 013-3h6a3 3 0 013 3m-12-9a3 3 0 006 0 3 3 0 00-6 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Click or drop your photo here
              </p>
              <p className="text-xs text-slate-500 mt-1 font-display">
                JPG, PNG or WEBP up to 5 MB. You can crop, zoom and rotate after selecting.
              </p>
            </div>
          </label>
        )}

        {uploadError && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
            {uploadError}
          </div>
        )}
      </section>

      {/* ── 2. Preview with name + college ── */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            2
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">Preview Your Poster</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
              Name on poster
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="input-field text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
              College on poster
            </label>
            <input
              type="text"
              value={college}
              onChange={(e) => setCollege(e.target.value)}
              placeholder="Enter your college name"
              className="input-field text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col items-center">
          {!posterReady && !posterError && (
            <div className="w-full aspect-[4/5] max-w-[360px] rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin" />
              <span className="font-mono text-xs uppercase tracking-widest text-slate-500 font-semibold">
                Rendering poster...
              </span>
            </div>
          )}

          {posterError && (
            <div className="w-full p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono text-center">
              {posterError}
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={POSTER.width}
            height={POSTER.height}
            className={`w-full max-w-[360px] h-auto rounded-xl shadow-lg border border-slate-200 ${
              posterReady ? "block" : "hidden"
            }`}
          />

          {posterReady && !hasPhoto && (
            <p className="text-xs text-slate-500 font-display mt-3">
              Upload your photo in step 1 to place it in the circular frame.
            </p>
          )}

          {posterReady && hasPhoto && (
            <button
              type="button"
              onClick={handleReCrop}
              className="mt-3 btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <span>Crop &amp; Re-adjust Photo</span>
            </button>
          )}
        </div>
      </section>

      {/* ── 3. Download ── */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            3
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">Download Your Poster</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4 font-display leading-relaxed">
          Exports a high-resolution 1080x1350 PNG. You must upload a photo first.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!hasPhoto}
          className="w-full sm:w-auto btn-primary text-xs py-3 px-8"
        >
          {hasPhoto ? "Download Poster (PNG)" : "Upload a photo to unlock download"}
        </button>
      </section>

      {/* ── 4. LinkedIn caption ── */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            4
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">LinkedIn Post Message</h3>
        </div>
        <p className="text-xs text-slate-500 mb-3 font-display leading-relaxed">
          Post your poster on LinkedIn and copy this ready-made caption.
        </p>
        <textarea
          readOnly
          rows={11}
          value={caption}
          className="input-field text-sm font-display leading-relaxed resize-y"
        />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={handleCopy} className="btn-primary text-xs py-2.5 px-6">
            {copied ? "Copied!" : "Copy Caption"}
          </button>
          {copied && (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-700">
              Copied to clipboard
            </span>
          )}
        </div>
      </section>

      {/* ── 5. Submit LinkedIn link ── */}
      <section className="pro-card rounded-2xl p-6 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-mono font-bold">
            5
          </span>
          <h3 className="font-heading font-bold text-lg text-slate-900">Submit Your Post Link</h3>
        </div>

        {alreadySubmitted && submitStatus === "done" && !editingLink ? (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-700 font-heading font-bold mb-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Task 1 Completed!
            </div>
            <p className="text-xs text-emerald-800 font-display leading-relaxed mb-3">
              Your LinkedIn post link has been saved. Admins can now verify and award points.
            </p>
            {savedLink && (
              <a
                href={savedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs font-mono text-teal-700 underline break-all mb-3"
              >
                {savedLink}
              </a>
            )}
            <button
              type="button"
              onClick={() => setEditingLink(true)}
              className="btn-secondary text-xs py-2 px-5"
            >
              Edit Link
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-2">
                Public LinkedIn post URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={postUrl}
                onChange={(e) => {
                  setPostUrl(e.target.value);
                  setLinkError("");
                }}
                placeholder="https://www.linkedin.com/posts/..."
                className="input-field text-xs"
              />
              <p className="text-[11px] text-slate-400 font-display mt-1.5">
                Open your post on LinkedIn, tap the three dots and choose &quot;Copy link to post&quot; — then
                paste it here.
              </p>
              {linkError && (
                <div className="mt-2 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                  {linkError}
                </div>
              )}
            </div>

            {submitError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto btn-teal text-xs py-3 px-8"
            >
              {submitting
                ? alreadySubmitted
                  ? "Updating..."
                  : "Submitting..."
                : alreadySubmitted
                ? "Update Link"
                : "Submit Task 1"}
            </button>
          </form>
        )}
      </section>

      {/* ── Crop modal ── */}
      {cropOpen && cropSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
            onClick={cancelCrop}
            aria-hidden="true"
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-lg text-slate-900">Crop Your Photo</h3>
              <button
                type="button"
                onClick={cancelCrop}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                aria-label="Close crop"
              >
                ×
              </button>
            </div>

            <div className="w-full h-[300px] sm:h-[340px] overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={cropImgRef}
                src={cropSrc}
                alt="Photo to crop"
                style={{ maxWidth: "100%" }}
              />
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-mono font-semibold uppercase text-slate-600 mb-1.5">
                  Zoom
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setZoom(v);
                    cropperRef.current?.zoomTo(v);
                  }}
                  className="w-full accent-teal-700"
                />
              </div>

              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => cropperRef.current?.rotate(-90)}
                  className="btn-secondary text-xs py-2 px-3.5"
                >
                  Rotate Left -90°
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cropperRef.current?.reset();
                    setZoom(1);
                  }}
                  className="btn-secondary text-xs py-2 px-3"
                  title="Reset to default crop"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => cropperRef.current?.rotate(90)}
                  className="btn-secondary text-xs py-2 px-3.5"
                >
                  Rotate +90°
                </button>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={cancelCrop} className="flex-1 btn-ghost text-xs py-2.5">
                  Cancel
                </button>
                <button type="button" onClick={applyCrop} className="flex-1 btn-primary text-xs py-2.5">
                  Apply Photo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}