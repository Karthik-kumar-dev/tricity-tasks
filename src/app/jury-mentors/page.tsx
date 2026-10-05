"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import JuryMentorFlow from "@/components/JuryMentorFlow";

export default function JuryMentorsPage() {
  const [isActive, setIsActive] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.jury_mentors_active === "boolean") {
          setIsActive(data.jury_mentors_active);
        } else {
          setIsActive(true);
        }
      })
      .catch(() => setIsActive(true));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50 text-slate-900 selection:bg-teal-100 selection:text-teal-900">
      {/* ── Sticky Header (Admin/VIP Portal Style) ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
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
                Jury &amp; Mentors VIP Portal
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${isActive === false ? "bg-slate-400" : "bg-teal-500 animate-pulse"}`} />
            <div className="px-3 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-bold">
              {isActive === false ? "Portal Locked" : "VIP Access Active"}
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero Banner ── */}
      <div className="bg-slate-900 border-b border-slate-800 py-12 px-4 sm:px-6 text-center text-white relative overflow-hidden shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-600" />
        <div className="max-w-3xl mx-auto relative z-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full bg-slate-800 border border-teal-500/30 text-teal-300 text-xs font-mono font-bold">
            <span>VIP SPOTLIGHT PORTAL</span>
            <span className="text-teal-600">·</span>
            <span>⚖️ JURY MEMBER</span>
            <span className="text-teal-600">·</span>
            <span>💡 MENTOR</span>
          </div>

          <h1 className="font-heading font-bold text-3xl sm:text-4xl md:text-5xl text-white tracking-tight mb-3">
            Jury &amp; Mentors VIP Spotlight
          </h1>
          <p className="text-sm sm:text-base text-slate-300 font-display max-w-xl mx-auto leading-relaxed">
            Generate your official personalized announcement poster for <strong>TRI-CITY AI HACKATHON 2026</strong>. Crop your face, add your credentials &amp; download high-resolution graphics.
          </p>
        </div>
      </div>

      {/* ── Main Flow Container ── */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
        {isActive === false ? (
          <div className="pro-card rounded-2xl p-12 text-center max-w-md mx-auto bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto text-2xl">
              🔒
            </div>
            <h2 className="font-heading font-bold text-xl text-slate-900">
              Spotlight Portal Locked
            </h2>
            <p className="text-xs text-slate-600 font-display leading-relaxed">
              The Jury &amp; Mentors spotlight poster portal is currently locked by tournament administrators. Please check back later or contact the organizers.
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="btn-primary text-xs py-2.5 px-5 inline-flex items-center gap-2"
              >
                <span>← Return to Home</span>
              </Link>
            </div>
          </div>
        ) : (
          <JuryMentorFlow />
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs font-mono text-slate-400">
        Tri-City Hackathon 2026 · Warangal · Hanamkonda · Kazipet · Centle India
      </footer>
    </div>
  );
}
