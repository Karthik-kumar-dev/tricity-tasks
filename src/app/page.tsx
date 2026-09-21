"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { MAX_SCORE, TASK_POINTS, TOTAL_TASKS } from "@/lib/constants";

interface Task {
  id: number;
  title: string;
  description: string;
  is_active: boolean;
}

interface StartFormData {
  taskId: number;
  team_id: string;
  team_name: string;
  member_name: string;
  role: string;
  college_name: string;
}

interface LeaderboardTeam {
  team_id: string;
  total_score: number;
  avg_score: number | null;
  tasks_scored: number;
  task_averages: { task_id: number; avg: number }[];
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardTeam[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResult, setSearchResult] = useState<LeaderboardTeam | null>(null);
  const [searchRank, setSearchRank] = useState<number | null>(null);
  const [searchMsg, setSearchMsg] = useState("");
  const [searching, setSearching] = useState(false);
  const [activeModal, setActiveModal] = useState<number | null>(null);
  const [formData, setFormData] = useState<StartFormData>({
    taskId: 0,
    team_id: "",
    team_name: "",
    member_name: "",
    role: "",
    college_name: "",
  });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Guided Team & Member Selection State
  const [teamSearchInput, setTeamSearchInput] = useState("");
  const [teamOptions, setTeamOptions] = useState<Array<{ registration_id: string; team_name: string }>>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{ registration_id: string; team_name: string } | null>(null);
  const [teamMembers, setTeamMembers] = useState<Array<{ member_name: string; role: string }>>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{ member_name: string; role: string } | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<"all" | "day1" | "day2">("all");

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState({
    days: "20",
    hours: "08",
    minutes: "42",
    seconds: "15",
  });

  useEffect(() => {
    // Target event date: Oct 10, 2026 09:00:00 IST
    const targetDate = new Date("2026-10-10T09:00:00+05:30").getTime();

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const difference = targetDate - now;

      if (difference > 0) {
        const d = Math.floor(difference / (1000 * 60 * 60 * 24));
        const h = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((difference % (1000 * 60)) / 1000);

        setTimeLeft({
          days: d.toString().padStart(2, "0"),
          hours: h.toString().padStart(2, "0"),
          minutes: m.toString().padStart(2, "0"),
          seconds: s.toString().padStart(2, "0"),
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Pre-fill from cookies on client after hydration
    const cookies = document.cookie.split("; ").reduce((acc, c) => {
      const [key, ...val] = c.split("=");
      acc[key] = decodeURIComponent(val.join("="));
      return acc;
    }, {} as Record<string, string>);

    if (cookies.team_id || cookies.member_name || cookies.college_name) {
      setFormData((prev) => ({
        ...prev,
        team_id: cookies.team_id || "",
        team_name: cookies.team_name || "",
        member_name: cookies.member_name || "",
        role: cookies.member_role || "",
        college_name: cookies.college_name || "",
      }));

      if (cookies.team_id) {
        setSelectedTeam({
          registration_id: cookies.team_id,
          team_name: cookies.team_name || "",
        });
        setTeamSearchInput(
          cookies.team_name
            ? `${cookies.team_id} - ${cookies.team_name}`
            : cookies.team_id
        );
      }

      if (cookies.member_name) {
        setSelectedMember({
          member_name: cookies.member_name,
          role: cookies.member_role || "Member",
        });
      }
    }

    fetch("/api/tasks")
      .then((res) => res.json())
      .then((data) => setTasks(data.tasks || []))
      .catch(() => console.error("Failed to fetch tasks"))
      .finally(() => setLoading(false));

    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => setLeaderboard(data.teams || []))
      .catch(() => console.error("Failed to fetch leaderboard"))
      .finally(() => setLeaderboardLoading(false));
  }, []);

  // Debounced search for teams dropdown
  useEffect(() => {
    if (!activeModal) return;
    if (manualMode) return;

    const timer = setTimeout(() => {
      setLoadingTeams(true);
      fetch(`/api/teams?q=${encodeURIComponent(teamSearchInput.trim())}`)
        .then((res) => res.json())
        .then((data) => {
          setTeamOptions(data.teams || []);
        })
        .catch(() => setTeamOptions([]))
        .finally(() => setLoadingTeams(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [teamSearchInput, activeModal, manualMode]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = searchTerm.trim();
    if (!term) return;

    setSearching(true);
    setSearchMsg("");
    setSearchResult(null);
    setSearchRank(null);

    try {
      const res = await fetch(`/api/leaderboard?team_id=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchMsg(data.error || "Something went wrong");
      } else if (!data.team) {
        setSearchMsg(`No team found with ID "${term}".`);
      } else {
        setSearchResult(data.team);
        setSearchRank(data.rank);
      }
    } catch {
      setSearchMsg("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function openStartModal(taskId: number) {
    setActiveModal(taskId);
    setFormData((prev) => ({ ...prev, taskId }));
    setFormError("");
    setIsDropdownOpen(false);

    // If already pre-filled from cookies, fetch members immediately
    if (selectedTeam?.registration_id) {
      setLoadingMembers(true);
      fetch(`/api/teams/${encodeURIComponent(selectedTeam.registration_id)}/members`)
        .then((res) => res.json())
        .then((data) => setTeamMembers(data.members || []))
        .catch(() => { })
        .finally(() => setLoadingMembers(false));
    }
  }

  function handleSelectTeam(team: { registration_id: string; team_name: string }) {
    setSelectedTeam(team);
    setTeamSearchInput(`${team.registration_id} - ${team.team_name}`);
    setIsDropdownOpen(false);
    setSelectedMember(null);
    setLoadingMembers(true);
    setFormError("");

    fetch(`/api/teams/${encodeURIComponent(team.registration_id)}/members`)
      .then((res) => res.json())
      .then((data) => {
        setTeamMembers(data.members || []);
      })
      .catch(() => {
        setTeamMembers([]);
        setFormError("Failed to load team members. Please try again.");
      })
      .finally(() => setLoadingMembers(false));
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    let regId = "";
    let tName = "";
    let mName = "";
    let role = "";
    const colName = formData.college_name.trim();

    if (!manualMode) {
      if (!selectedTeam) {
        setFormError("Please select your team from the dropdown search");
        return;
      }
      if (!selectedMember) {
        setFormError("Please select your name from the team members list");
        return;
      }
      if (!colName) {
        setFormError("Please enter your college name");
        return;
      }
      regId = selectedTeam.registration_id.trim();
      tName = selectedTeam.team_name.trim();
      mName = selectedMember.member_name.trim();
      role = selectedMember.role.trim();
    } else {
      regId = formData.team_id.trim();
      mName = formData.member_name.trim();
      if (!regId) {
        setFormError("Please enter your Team / Registration ID");
        return;
      }
      if (!mName) {
        setFormError("Please enter your full name");
        return;
      }
      if (!colName) {
        setFormError("Please enter your college name");
        return;
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/tasks/${formData.taskId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_id: regId,
          team_id: regId,
          team_name: tName,
          member_name: mName,
          role: role,
          college_name: colName,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Something went wrong");
        setSubmitting(false);
        return;
      }

      window.location.href = `/task/${formData.taskId}`;
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const problemTracks = [
    {
      id: "01",
      title: "SaaSum AI",
      category: "Artificial Intelligence",
      description: "Build intelligent software solutions leveraging state-of-the-art AI, agentic workflows, and modern cloud infrastructure.",
      color: "border-teal-500/30 text-teal-700 bg-teal-50",
    },
    {
      id: "02",
      title: "Maceco",
      category: "Data & Analytics",
      description: "Create high-performance data-driven systems with advanced real-time analytics, dashboards, and visualization tools.",
      color: "border-blue-500/30 text-blue-700 bg-blue-50",
    },
    {
      id: "03",
      title: "Tobofu",
      category: "MarTech & Growth",
      description: "Innovate marketing technology, viral acquisition mechanics, and personalized customer engagement platforms.",
      color: "border-indigo-500/30 text-indigo-700 bg-indigo-50",
    },
    {
      id: "04",
      title: "Promtal",
      category: "HR & Workplace",
      description: "Develop human resources technology for talent onboarding, automated skill verification, and remote workplace innovation.",
      color: "border-purple-500/30 text-purple-700 bg-purple-50",
    },
    {
      id: "05",
      title: "Skill Tank",
      category: "EdTech & Learning",
      description: "Transform education and career readiness through interactive tech-driven learning platforms, simulations, and feedback loops.",
      color: "border-amber-500/30 text-amber-700 bg-amber-50",
    },
    {
      id: "06",
      title: "Vriddhi",
      category: "FinTech & Payments",
      description: "Build next-generation financial technology solutions for automated accounting, peer payments, micro-lending, and security.",
      color: "border-emerald-500/30 text-emerald-700 bg-emerald-50",
    },
    {
      id: "07",
      title: "Open Innovation",
      category: "General Domain",
      description: "Bring your own creative problem statement and engineer a full-stack solution in any domain or emerging technology.",
      color: "border-slate-500/30 text-slate-700 bg-slate-100",
    },
  ];

  const timelineEvents = [
    {
      date: "Sept 5",
      title: "Registration Opens",
      icon: "📋",
      status: "Completed",
      description: "Sign up as an individual or team across Warangal, Hanamkonda, or Kazipet.",
    },
    {
      date: "Oct 9",
      title: "Registration Closes (11:59 PM)",
      icon: "🔒",
      status: "Upcoming",
      description: "Final deadline for team confirmation, member details, and problem track selection.",
    },
    {
      date: "Oct 10, 09:30 AM",
      title: "Opening Ceremony & Keynote",
      icon: "🎤",
      status: "Upcoming",
      description: "Official kickoff, guest addresses, and mentor orientation across tri-city centers.",
    },
    {
      date: "Oct 10, 12:00 PM",
      title: "24-Hour Hacking Begins",
      icon: "🚀",
      status: "Upcoming",
      description: "Continuous development sprint commences with milestone checkpoints and on-site guidance.",
    },
    {
      date: "Oct 11, 11:59 AM",
      title: "Code Submissions Due",
      icon: "📦",
      status: "Upcoming",
      description: "Final code repositories submitted, demo videos verified, and evaluation queue created.",
    },
    {
      date: "Oct 11, 12:30 PM",
      title: "Presentations & Valedictory",
      icon: "🏆",
      status: "Upcoming",
      description: "Live pitch evaluations before executive judges, awards ceremony, and grand prize distribution.",
    },
  ];

  const galleryItems = [
    {
      id: 1,
      title: "Hackathon Opening & Keynote",
      tag: "Day 1",
      day: "day1",
      desc: "Inspirational address and tournament kickoff in Warangal.",
      icon: "🎤",
    },
    {
      id: 2,
      title: "Team Formation & Brainstorming",
      tag: "Day 1",
      day: "day1",
      desc: "Ideation rounds across academic hubs.",
      icon: "💡",
    },
    {
      id: 3,
      title: "Hacking Sprint Session",
      tag: "Day 1",
      day: "day1",
      desc: "Engineers deep into code and prototype architecture.",
      icon: "💻",
    },
    {
      id: 4,
      title: "Midnight Coding & Prototyping",
      tag: "Day 2",
      day: "day2",
      desc: "High energy, caffeine-fueled sprints through the night.",
      icon: "🌙",
    },
    {
      id: 5,
      title: "Mentor Review & Polish",
      tag: "Day 2",
      day: "day2",
      desc: "Direct architectural advice and debugging with industry leads.",
      icon: "🛠️",
    },
    {
      id: 6,
      title: "Awards & Grand Finale Celebration",
      tag: "Day 2",
      day: "day2",
      desc: "Recognizing winning teams and felicitating top performers.",
      icon: "🏆",
    },
  ];

  const filteredGallery = useMemo(() => {
    if (galleryFilter === "all") return galleryItems;
    return galleryItems.filter((item) => item.day === galleryFilter);
  }, [galleryFilter]);

  const faqs = [
    {
      q: "Who can participate in the Tri-City Hackathon?",
      a: "The hackathon is open to all university students, recent graduates, engineering scholars, and aspiring technologists. Teams can consist of 1 to 4 members representing institutions across Warangal, Hanamkonda, Kazipet, and beyond.",
    },
    {
      q: "How does team formation work for the tri-city format?",
      a: "You can register as an established team or join the pre-event Discord/community channels to connect with peers from other colleges across the tri-cities. Inter-college teams are encouraged!",
    },
    {
      q: "What should I bring to the hackathon?",
      a: "Bring your laptop, charger, student identification, any necessary hardware components if competing in IoT/hardware tracks, and plenty of enthusiasm. High-speed internet, power strips, and snacks will be provided.",
    },
    {
      q: "Are there any registration fees?",
      a: "No! Participation in the Tri-City Hackathon is completely free, backed by Centle India Hyderabad and our ecosystem partners to promote student innovation.",
    },
    {
      q: "What are the evaluation criteria?",
      a: "Submissions are evaluated on: Innovation & Originality (25%), Technical Execution & Complexity (25%), Practical Impact & Market Viability (25%), and Presentation & User Experience (25%).",
    },
    {
      q: "Can we use pre-existing code?",
      a: "All core project code must be authored during the 24-hour hackathon. You may use open-source libraries, public APIs, starter kits, and framework boilerplates, but foundational architecture must be built live.",
    },
  ];

  const partners = [
    { name: "NexaTech", tier: "Platinum" },
    { name: "CyberPulse", tier: "Platinum" },
    { name: "VortexAI", tier: "Platinum" },
    { name: "DataForge", tier: "Gold" },
    { name: "CloudNova", tier: "Gold" },
    { name: "ByteShift", tier: "Gold" },
    { name: "QuantumStack", tier: "Gold" },
    { name: "CodeHive", tier: "Silver" },
    { name: "InfraCore", tier: "Silver" },
    { name: "SynthLabs", tier: "Silver" },
    { name: "PixelMesh", tier: "Silver" },
    { name: "ArcLight", tier: "Silver" },
    { name: "ZenDev", tier: "Silver" },
  ];

  return (
    <div className="relative min-h-screen bg-white text-slate-900 selection:bg-teal-100 selection:text-teal-900">
      {/* ── Sticky Navigation Bar ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="#hero" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white font-mono font-bold text-xs shadow-sm group-hover:bg-teal-700 transition-colors">
              TC
            </div>
            <div className="flex flex-col">
              <span className="font-heading font-bold text-sm tracking-wider uppercase text-slate-900 group-hover:text-teal-700 transition-colors">
                Tri-City Hackathon
              </span>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest -mt-0.5">
                Centle India · TS 2026
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden lg:flex items-center gap-1">
            <a href="#timeline" className="px-3.5 py-1.5 font-mono text-xs tracking-wider uppercase text-slate-600 hover:text-teal-700 hover:bg-slate-50 rounded-md transition-colors">
              Timeline
            </a>
            <a href="#tasks" className="px-3.5 py-1.5 font-mono text-xs tracking-wider uppercase text-teal-700 font-bold bg-teal-50 rounded-md border border-teal-100 transition-colors">
              Live Tasks
            </a>
            <a href="#leaderboard" className="px-3.5 py-1.5 font-mono text-xs tracking-wider uppercase text-slate-600 hover:text-teal-700 hover:bg-slate-50 rounded-md transition-colors">
              Leaderboard
            </a>
            <a href="#faq" className="px-3.5 py-1.5 font-mono text-xs tracking-wider uppercase text-slate-600 hover:text-teal-700 hover:bg-slate-50 rounded-md transition-colors">
              FAQ
            </a>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <a
              href="#tasks"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-mono text-xs font-bold tracking-wider uppercase shadow-xs transition-all"
            >
              <span>Start Tasks</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>

            {/* Mobile menu trigger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Toggle Navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 pt-2 pb-5 space-y-2 shadow-lg">
            <a
              href="#about"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              About
            </a>
            <a
              href="#tracks"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              Tracks
            </a>
            <a
              href="#timeline"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              Timeline
            </a>
            <a
              href="#tasks"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase font-bold text-teal-700 bg-teal-50"
            >
              Live Tasks & Challenges
            </a>
            <a
              href="#leaderboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              Leaderboard
            </a>
            <a
              href="#gallery"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              Archive
            </a>
            <a
              href="#sponsors"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              Partners
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md font-mono text-xs uppercase text-slate-700 hover:bg-slate-100"
            >
              FAQ
            </a>
          </div>
        )}
      </nav>

      {/* ── Hero Section ── */}
      <section id="hero" className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 bg-gradient-to-b from-slate-50 via-white to-white overflow-hidden border-b border-slate-100">
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2.5 mb-6 px-4 py-1.5 rounded-full border border-teal-200 bg-teal-50/80 text-teal-900 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            <span className="font-mono text-xs font-semibold tracking-wider uppercase">
              October 10–11, 2026 · Warangal | Hanamkonda | Kazipet
            </span>
          </div>

          {/* Title */}
          <h1 className="font-display font-extrabold text-4xl sm:text-6xl md:text-7xl lg:text-8xl tracking-tight text-slate-900 leading-[1.08] mb-4">
            Tri-City Hackathon
            <span className="block text-xl sm:text-3xl md:text-4xl font-heading font-semibold text-teal-700 tracking-normal mt-2">
              Warangal · Hanamkonda · Kazipet
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed font-display">
            24 hours of innovation across Telangana&apos;s historic tri-cities. Centle India Hyderabad brings together student creators, developers, and industry mentors across{" "}
            <span className="font-semibold text-slate-900">Warangal</span>,{" "}
            <span className="font-semibold text-slate-900">Hanamkonda</span>, and{" "}
            <span className="font-semibold text-slate-900">Kazipet</span>.
          </p>

          {/* Countdown Clock */}
          <div className="mb-10">
            <p className="font-mono text-xs uppercase tracking-widest text-slate-400 mb-3 font-semibold">
              Event Hack Sprint Starts In
            </p>
            <div className="flex justify-center gap-2 sm:gap-4 md:gap-6">
              {[
                { label: "Days", val: timeLeft.days },
                { label: "Hours", val: timeLeft.hours },
                { label: "Mins", val: timeLeft.minutes },
                { label: "Secs", val: timeLeft.seconds },
              ].map((time, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center bg-white border border-slate-200 rounded-xl px-3 py-3 sm:px-5 sm:py-3.5 min-w-[70px] sm:min-w-[88px] md:min-w-[104px] shadow-sm hover:border-teal-500 transition-colors"
                >
                  <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 tabular-nums">
                    {time.val}
                  </span>
                  <span className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-slate-400 mt-1 font-medium">
                    {time.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 max-w-md mx-auto mb-14">
            <a href="#tasks" className="btn-primary w-full sm:w-auto text-sm py-3 px-7">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Explore Live Tasks</span>
            </a>
            <a href="#about" className="btn-secondary w-full sm:w-auto text-sm py-3 px-7">
              <span>Learn More</span>
            </a>
          </div>

          {/* Quick Metrics */}
          <div className="pt-10 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="font-heading font-bold text-2xl sm:text-3xl text-slate-900">1000+</div>
              <div className="font-mono text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 mt-1">Participants</div>
            </div>
            <div className="text-center">
              <div className="font-heading font-bold text-2xl sm:text-3xl text-teal-700">24h</div>
              <div className="font-mono text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 mt-1">Continuous Sprint</div>
            </div>
            <div className="text-center">
              <div className="font-heading font-bold text-2xl sm:text-3xl text-slate-900">3</div>
              <div className="font-mono text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 mt-1">Tri-City Hubs</div>
            </div>
            <div className="text-center">
              <div className="font-heading font-bold text-2xl sm:text-3xl text-emerald-700">₹50,000</div>
              <div className="font-mono text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 mt-1">Grand Prizes</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Section: LIVE TASKS & CHALLENGES ── */}
      <section id="tasks" className="py-24 sm:py-32 px-4 sm:px-6 bg-slate-50/70 border-b border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-mono font-semibold">
                <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
                LIVE TOURNAMENT ENGINE
              </div>
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-slate-900 leading-tight">
                Daily Tasks &amp; Challenges
              </h2>
              <p className="text-base text-slate-600 max-w-xl mt-3 font-display">
                Click any active task to enter your Team ID and name. Submit your answer and link to earn up to {TASK_POINTS} points per challenge.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="#leaderboard"
                className="btn-secondary text-xs font-mono"
              >
                <span>View Standings ↓</span>
              </a>
            </div>
          </div>

          {/* Task Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="pro-card rounded-2xl p-7 h-64 animate-pulse bg-white flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="h-4 bg-slate-200 rounded-md w-1/3" />
                    <div className="h-6 bg-slate-200 rounded-md w-3/4" />
                    <div className="h-14 bg-slate-100 rounded-md w-full" />
                  </div>
                  <div className="h-10 bg-slate-200 rounded-lg w-full" />
                </div>
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <div className="pro-card rounded-2xl p-12 text-center max-w-lg mx-auto bg-white">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 text-xl">
                ⚠️
              </div>
              <h3 className="font-heading font-bold text-lg text-slate-900 mb-1">No Tasks Found</h3>
              <p className="text-sm text-slate-500 mb-6">
                Ensure Supabase schema is seeded and tasks table is populated.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`pro-card rounded-2xl p-7 flex flex-col justify-between bg-white relative overflow-hidden transition-all duration-300 ${task.is_active ? "hover:border-teal-600 shadow-xs" : "opacity-75 bg-slate-50"
                    }`}
                >
                  {/* Active highlight top bar */}
                  {task.is_active && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-600 to-emerald-500" />
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">
                        Task #{task.id}
                      </span>
                      {task.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-100 text-slate-500 border border-slate-200">
                          <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          LOCKED
                        </span>
                      )}
                    </div>

                    <h3 className="font-heading font-bold text-xl text-slate-900 mb-2.5">
                      {task.title}
                    </h3>
                    <p className="text-sm text-slate-600 leading-relaxed font-display line-clamp-3 mb-6">
                      {task.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    {task.is_active ? (
                      <button
                        onClick={() => openStartModal(task.id)}
                        className="w-full btn-primary text-xs py-2.5"
                      >
                        <span>Start Challenge</span>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-400 font-mono text-xs font-semibold uppercase cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Locked</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Section: LIVE LEADERBOARD ── */}
      <section id="leaderboard" className="py-24 sm:py-32 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-teal-700 font-bold">03</span>
            <span className="h-[1px] w-10 bg-teal-600/40" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-slate-500 font-medium">Tournament Standings</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-slate-900 leading-tight mb-4">
            Live Leaderboard
          </h2>
          <p className="text-base text-slate-600 max-w-2xl leading-relaxed mb-10 font-display">
            Rankings updated dynamically based on submitted scores across all {TOTAL_TASKS} hackathon tasks. Maximum {MAX_SCORE} total points possible.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Top Teams Table */}
            <div className="lg:col-span-7 pro-card rounded-2xl overflow-hidden bg-white">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <span className="text-base">🏆</span>
                  <h3 className="font-heading font-bold text-sm uppercase tracking-wider text-slate-900">
                    Leaderboard Rankings
                  </h3>
                </div>
                <span className="font-mono text-xs text-slate-500 uppercase">
                  Avg / 5 Tasks
                </span>
              </div>

              <div>
                {leaderboardLoading ? (
                  <div className="p-6 space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="p-10 text-center text-sm text-slate-500">
                    No scores recorded yet. Submit task answers to appear on the leaderboard!
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {leaderboard.map((team, idx) => {
                      const medalColors = [
                        "bg-amber-100 text-amber-800 border-amber-300",
                        "bg-slate-200 text-slate-800 border-slate-300",
                        "bg-orange-100 text-orange-800 border-orange-300",
                      ];
                      return (
                        <div
                          key={team.team_id}
                          className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-3.5">
                            <span
                              className={`w-7 h-7 rounded-md font-mono text-xs font-bold flex items-center justify-center border ${medalColors[idx] || "bg-slate-50 text-slate-600 border-slate-200"
                                }`}
                            >
                              #{idx + 1}
                            </span>
                            <div>
                              <div className="font-heading font-bold text-sm text-slate-900">
                                {team.team_id}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                {team.tasks_scored} of 5 scored
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-mono text-base font-bold text-teal-700">
                              {team.total_score != null ? `${team.total_score} / ${MAX_SCORE}` : "—"}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {team.tasks_scored} of {TOTAL_TASKS} scored
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Team Lookup Card */}
            <div className="lg:col-span-5 pro-card rounded-2xl p-6 sm:p-7 bg-white">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🔍</span>
                <h3 className="font-heading font-bold text-base text-slate-900">
                  Search Team Standings
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-5 font-display leading-relaxed">
                Check your exact rank, breakdown across completed tasks, and total points by Team ID.
              </p>

              <form onSubmit={handleSearch} className="space-y-4 mb-5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="e.g. ALPHA_CREW"
                    className="input-field text-xs uppercase"
                  />
                  <button
                    type="submit"
                    disabled={searching}
                    className="btn-primary text-xs shrink-0 px-4"
                  >
                    {searching ? "Searching..." : "Find"}
                  </button>
                </div>
              </form>

              {searchMsg && (
                <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono">
                  {searchMsg}
                </div>
              )}

              {searchResult && (
                <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">
                        Team ID
                      </span>
                      <div className="font-heading font-bold text-lg text-slate-900">
                        {searchResult.team_id}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">
                        Current Rank
                      </span>
                      <div className="font-mono font-bold text-lg text-teal-700">
                        #{searchRank}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-white border border-slate-200">
                      <div className="font-mono text-[10px] text-slate-400 uppercase">Avg Per Task</div>
                      <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
                        {searchResult.avg_score != null ? `${searchResult.avg_score.toFixed(1)} / ${TASK_POINTS}` : "N/A"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-slate-200">
                      <div className="font-mono text-[10px] text-slate-400 uppercase">Total Score</div>
                      <div className="font-mono text-base font-bold text-emerald-700 mt-0.5">
                        {searchResult.total_score} / {MAX_SCORE}
                      </div>
                    </div>
                  </div>

                  {searchResult.task_averages && searchResult.task_averages.length > 0 && (
                    <div className="pt-2">
                      <span className="font-mono text-[11px] text-slate-500 uppercase block mb-2 font-semibold">
                        Task Scores Breakdown:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {searchResult.task_averages.map((ta) => (
                          <span
                            key={ta.task_id}
                            className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono text-xs text-slate-700"
                          >
                            Task #{ta.task_id}: <strong className="text-teal-700">{ta.avg}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 03: Event Timeline ── */}
      <section id="timeline" className="py-24 sm:py-32 px-4 sm:px-6 bg-slate-50/60 border-b border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-teal-700 font-bold">04</span>
            <span className="h-[1px] w-10 bg-teal-600/40" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-slate-500 font-medium">Schedule</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-slate-900 leading-tight mb-14">
            Event Schedule &amp; Timeline
          </h2>

          <div className="relative pl-6 md:pl-0">
            {/* Vertical timeline line */}
            <div className="md:hidden absolute left-2 top-2 bottom-2 w-[2px] bg-slate-200" />
            <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-[2px] bg-slate-200" />

            <div className="space-y-8 md:space-y-12">
              {timelineEvents.map((evt, idx) => {
                const isEven = idx % 2 === 0;
                return (
                  <div
                    key={idx}
                    className={`relative flex items-center gap-6 md:gap-0 ${isEven ? "md:flex-row" : "md:flex-row-reverse"
                      }`}
                  >
                    {/* Content Box */}
                    <div className={`flex-1 ${isEven ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left"}`}>
                      <div className="pro-card rounded-2xl p-6 bg-white hover:border-teal-500">
                        <div className={`flex items-center gap-2 mb-2 ${isEven ? "md:flex-row-reverse" : ""}`}>
                          <span className="text-xl">{evt.icon}</span>
                          <span className="font-mono text-xs font-bold tracking-wider uppercase text-teal-700">
                            {evt.date}
                          </span>
                        </div>
                        <h3 className="font-heading font-bold text-lg text-slate-900 mb-1.5">
                          {evt.title}
                        </h3>
                        <p className="text-sm text-slate-600 leading-relaxed font-display">
                          {evt.description}
                        </p>
                      </div>
                    </div>

                    {/* Timeline Node Desktop */}
                    <div className="hidden md:flex flex-col items-center z-10">
                      <div className="w-5 h-5 rounded-full border-2 border-white bg-teal-700 shadow-sm" />
                    </div>

                    {/* Timeline Node Mobile */}
                    <div className="md:hidden absolute -left-4 top-6">
                      <div className="w-4 h-4 rounded-full border-2 border-white bg-teal-700 shadow-sm" />
                    </div>

                    {/* Spacer for other side */}
                    <div className="hidden md:block flex-1" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 06: Frequently Asked Questions ── */}
      <section id="faq" className="py-24 sm:py-32 px-4 sm:px-6 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-teal-700 font-bold">07</span>
            <span className="h-[1px] w-10 bg-teal-600/40" />
            <span className="font-mono text-xs tracking-[0.25em] uppercase text-slate-500 font-medium">Questions</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-slate-900 leading-tight mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-base text-slate-600 max-w-xl mb-12 font-display">
            Key rules, team composition guidelines, and details for participants joining across the tri-cities.
          </p>

          <div className="pro-card rounded-2xl p-6 sm:p-8 bg-slate-50/50 divide-y divide-slate-200">
            {faqs.map((faq, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="py-5 first:pt-0 last:pb-0">
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full flex items-start justify-between gap-4 text-left group"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-start gap-4">
                      <span className="font-mono text-xs text-teal-700 font-bold mt-1 shrink-0">
                        0{idx + 1}
                      </span>
                      <span className="font-heading font-bold text-base sm:text-lg text-slate-900 group-hover:text-teal-700 transition-colors">
                        {faq.q}
                      </span>
                    </div>
                    <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-slate-500 text-sm font-mono group-hover:border-teal-600 group-hover:text-teal-700 transition-all">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="pt-3 pl-8 text-sm text-slate-600 font-display leading-relaxed">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Call To Action ── */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 bg-gradient-to-b from-slate-50 to-white text-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-teal-200 bg-teal-50 text-teal-800 text-xs font-mono font-semibold">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            WARANGAL · HANAMKONDA · KAZIPET
          </div>
          <h2 className="font-display font-extrabold text-3xl sm:text-5xl md:text-6xl text-slate-900 leading-tight mb-4">
            Build with the Tri-City Community
          </h2>
          <p className="text-base sm:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed mb-8 font-display">
            Join hundreds of innovators for 24 hours of creation, mentorship, problem-solving, and building future-proof technology.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#tasks" className="btn-primary text-sm py-3.5 px-8">
              <span>Start Challenge Now</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white py-12 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-mono font-bold text-xs">
              TC
            </div>
            <div>
              <div className="font-heading font-bold text-sm text-slate-900">
                TRI-CITY AI HACKATHON
              </div>
              <div className="text-xs text-slate-500 font-mono">
                Centle India Hyderabad · Telangana, India
              </div>
            </div>
          </div>

          <p className="font-mono text-xs text-slate-500">
            © 2026 Tri-City Hackathon. Warangal · Hanamkonda · Kazipet. All rights reserved.
          </p>

          <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
            <a href="#tasks" className="hover:text-teal-700">Tasks</a>
            <a href="#leaderboard" className="hover:text-teal-700">Leaderboard</a>
          </div>
        </div>
      </footer>

      {/* ── Start Task Modal ── */}
      {activeModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl p-6 sm:p-8 shadow-2xl border border-slate-200">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 text-lg font-mono"
            >
              ✕
            </button>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-mono font-bold mb-3">
              TASK #{formData.taskId}
            </div>

            <h3 className="font-heading font-bold text-xl text-slate-900 mb-1">
              Select Your Team &amp; Participant
            </h3>
            <p className="text-xs text-slate-600 mb-5 font-display leading-relaxed">
              Find your registered team, select your name, and enter your college to start task #{formData.taskId}.
            </p>

            <form onSubmit={handleStart} className="space-y-4">
              {/* Step 1: Searchable Team Dropdown */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-mono font-semibold uppercase text-slate-700">
                    Step 1: Select Team <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setManualMode(!manualMode);
                      setFormError("");
                    }}
                    className="text-[11px] font-mono text-teal-700 hover:text-teal-900 underline cursor-pointer"
                  >
                    {manualMode ? "← Use Dropdown Search" : "Manual ID Entry"}
                  </button>
                </div>

                {!manualMode ? (
                  <div className="relative">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search Registration ID or Team Name (e.g. TRI26004 or Ruhan)..."
                        value={teamSearchInput}
                        onChange={(e) => {
                          setTeamSearchInput(e.target.value);
                          setIsDropdownOpen(true);
                          if (selectedTeam) {
                            setSelectedTeam(null);
                            setSelectedMember(null);
                            setTeamMembers([]);
                          }
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                        className="input-field text-xs pr-9"
                      />
                      {loadingTeams && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    {/* Live Search Results Dropdown */}
                    {isDropdownOpen && (
                      <div className="absolute z-50 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1 divide-y divide-slate-100">
                        {teamOptions.length > 0 ? (
                          teamOptions.map((t) => (
                            <button
                              key={t.registration_id}
                              type="button"
                              onClick={() => handleSelectTeam(t)}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-teal-50 transition-colors flex items-center justify-between group"
                            >
                              <div>
                                <span className="font-mono font-bold text-xs text-teal-800 group-hover:text-teal-900 block">
                                  {t.registration_id} - {t.team_name}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono font-semibold text-slate-400 group-hover:text-teal-700">
                                Select →
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs font-mono text-slate-400">
                            {loadingTeams
                              ? "Searching teams..."
                              : "No registered teams found. Type to search or use manual entry."}
                          </div>
                        )}
                      </div>
                    )}

                    {selectedTeam && (
                      <div className="mt-2 p-2 rounded-lg bg-teal-50/80 border border-teal-200/80 flex items-center justify-between text-xs font-mono text-teal-900">
                        <span>
                          Team: <strong>{selectedTeam.registration_id} - {selectedTeam.team_name}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTeam(null);
                            setSelectedMember(null);
                            setTeamMembers([]);
                            setTeamSearchInput("");
                            setIsDropdownOpen(true);
                          }}
                          className="text-[10px] text-teal-700 hover:text-teal-950 font-bold ml-2 underline"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder="e.g. TRI-01 or TRI26004"
                      value={formData.team_id}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, team_id: e.target.value.toUpperCase() }))
                      }
                      className="input-field text-xs uppercase font-mono"
                    />
                    <p className="text-[11px] font-mono text-slate-500 mt-1">
                      Enter your registration or team identifier.
                    </p>
                  </div>
                )}
              </div>

              {/* Step 2 & 3: Member Selection (name + role) */}
              {!manualMode && selectedTeam && (
                <div>
                  <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                    Step 2: Select Your Name <span className="text-red-500">*</span>
                  </label>

                  {loadingMembers ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-500 flex items-center gap-2">
                      <div className="w-3.5 h-3.5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      Loading team members...
                    </div>
                  ) : teamMembers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {teamMembers.map((m, idx) => {
                        // Identify member by (registration_id, role)
                        const isSelected =
                          selectedMember?.role.toLowerCase() === m.role.toLowerCase() &&
                          selectedMember?.member_name.toLowerCase() === m.member_name.toLowerCase();

                        return (
                          <button
                            key={`${m.member_name}-${m.role}-${idx}`}
                            type="button"
                            onClick={() => setSelectedMember(m)}
                            className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${isSelected
                              ? "border-teal-600 bg-teal-50/90 ring-2 ring-teal-500/20 shadow-xs"
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white"
                              }`}
                          >
                            <div>
                              <div className="text-xs font-bold text-slate-900">
                                {m.member_name}
                              </div>
                              <div className="text-[10px] font-mono font-semibold text-teal-700 mt-0.5">
                                {m.role || "Member"}
                              </div>
                            </div>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] ${isSelected
                                ? "border-teal-600 bg-teal-600 text-white font-bold"
                                : "border-slate-300 bg-white"
                                }`}
                            >
                              {isSelected ? "✓" : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-mono text-amber-800">
                      No members registered under this team ID yet.
                    </div>
                  )}
                </div>
              )}

              {/* Manual Mode Member Name Input */}
              {manualMode && (
                <div>
                  <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                    Your Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={formData.member_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, member_name: e.target.value }))
                    }
                    className="input-field text-xs"
                  />
                </div>
              )}

              {/* Step 4: College / Institution Name */}
              <div>
                <label className="block text-xs font-mono font-semibold uppercase text-slate-700 mb-1.5">
                  Step 3: College / Institution Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NIT Warangal, KITS, SR University"
                  value={formData.college_name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, college_name: e.target.value }))
                  }
                  className="input-field text-xs"
                />
              </div>

              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-mono">
                  {formError}
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setIsDropdownOpen(false);
                  }}
                  className="btn-secondary flex-1 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary flex-1 text-xs"
                >
                  {submitting ? "Validating..." : "Enter Workspace →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
