"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { MAX_SCORE, TASK_POINTS } from "@/lib/constants";

interface Task {
  id: number;
  title: string;
  description?: string;
  is_active: boolean;
  rules?: string | null;
  linkedin_template?: string | null;
  instagram_template?: string | null;
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
  member_name: string;
  college_name?: string | null;
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

  // Task editing state (rules, template, description)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDesc, setTaskEditDesc] = useState("");
  const [taskEditRules, setTaskEditRules] = useState("");
  const [taskEditTemplate, setTaskEditTemplate] = useState("");
  const [taskEditInstagramTemplate, setTaskEditInstagramTemplate] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [taskSaveSuccess, setTaskSaveSuccess] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState("");

  // Score editing state
  const [editingScore, setEditingScore] = useState<number | null>(null);
  const [scoreValue, setScoreValue] = useState("");
  const [savingScore, setSavingScore] = useState(false);

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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    | { type: "submission"; id: number; label: string }
    | { type: "team"; teamId: string; label: string }
    | { type: "member"; teamId: string; memberName: string; label: string }
    | null
  >(null);

  // Check auth on load
  useEffect(() => {
    fetchTeams().then((ok) => {
      setAuthenticated(ok);
      setChecking(false);
      if (ok) {
        fetchTasks();
        fetchRegStats();
      }
    });
  }, []);

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
    setTaskSaveSuccess(false);
    setTaskSaveError("");
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setTaskSaveSuccess(false);
    setTaskSaveError("");
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
        fetchTeams();
      } else if (confirmAction.type === "team") {
        setSelectedTeam(null);
        setSubmissions([]);
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
  const filteredSubs = subSearchLower
    ? submissions.filter(
        (s) =>
          s.member_name.toLowerCase().includes(subSearchLower) ||
          s.task_title.toLowerCase().includes(subSearchLower) ||
          (s.college_name && s.college_name.toLowerCase().includes(subSearchLower))
      )
    : submissions;

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

        {/* ── TAB 2: TEAMS & SCORES ── */}
        {activeTab === "teams" && (
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
                    <h2 className="font-heading font-bold text-sm uppercase tracking-wider text-slate-700 mb-3">
                      Team Leaderboard ({teams.length})
                    </h2>
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

                {/* Submissions Detail Column */}
                <div className="lg:col-span-7">
                  {selectedTeam === null ? (
                    <div className="pro-card rounded-2xl p-16 text-center bg-white flex flex-col items-center justify-center min-h-[400px]">
                      <div className="text-3xl mb-3">👈</div>
                      <h3 className="font-heading font-bold text-base text-slate-800 mb-1">
                        Select a Team
                      </h3>
                      <p className="text-xs text-slate-400 font-display">
                        Click on any team in the left panel to review and score their task submissions.
                      </p>
                    </div>
                  ) : loadingTeam ? (
                    <div className="pro-card rounded-2xl p-16 text-center bg-white flex flex-col items-center justify-center min-h-[400px]">
                      <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-teal-700 animate-spin mb-3" />
                      <span className="font-mono text-xs uppercase tracking-wider text-slate-500 font-semibold">
                        Loading Submissions...
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Selected Team Bar */}
                      <div className="pro-card rounded-2xl p-5 bg-white flex items-center justify-between">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                            Viewing Submissions
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

                      {/* Submissions Search */}
                      <input
                        type="text"
                        className="input-field text-xs bg-white"
                        placeholder="⌕ Search submissions by member name or task..."
                        value={subSearch}
                        onChange={(e) => setSubSearch(e.target.value)}
                      />

                      {filteredSubs.length === 0 ? (
                        <div className="pro-card rounded-2xl p-10 text-center text-sm text-slate-500 bg-white">
                          {subSearch
                            ? `No submissions matching "${subSearch}"`
                            : "No submissions recorded for this team."}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {filteredSubs.map((sub) => (
                            <div
                              key={sub.id}
                              className="pro-card rounded-xl p-5 bg-white"
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-heading font-bold text-base text-slate-900">
                                      {sub.member_name}
                                    </span>
                                    {sub.college_name && (
                                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200">
                                        🏫 {sub.college_name}
                                      </span>
                                    )}
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                                      {sub.task_title}
                                    </span>
                                    <button
                                      onClick={() =>
                                        setConfirmAction({
                                          type: "member",
                                          teamId: selectedTeam || "",
                                          memberName: sub.member_name,
                                          label: `member "${sub.member_name}" and all their submissions`,
                                        })
                                      }
                                      className="text-[10px] font-mono px-2 py-0.5 rounded text-red-600 bg-red-50 border border-red-200 hover:bg-red-100"
                                      title="Delete all submissions by this member"
                                    >
                                      Remove User
                                    </button>
                                  </div>
                                  <p className="font-mono text-[11px] text-slate-400">
                                    {new Date(sub.created_at).toLocaleString()}
                                  </p>
                                </div>

                                {/* Score Badge & Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() =>
                                      setConfirmAction({
                                        type: "submission",
                                        id: sub.id,
                                        label: `submission by "${sub.member_name}" for "${sub.task_title}"`,
                                      })
                                    }
                                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center text-sm"
                                    title="Delete this submission"
                                  >
                                    🗑
                                  </button>

                                  {editingScore === sub.id ? (
                                    <div className="flex items-center gap-1.5">
                                      <input
                                        type="number"
                                        min="0"
                                        max={TASK_POINTS}
                                        className="input-field w-18 text-center text-xs py-1"
                                        value={scoreValue}
                                        onChange={(e) => setScoreValue(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") saveScore(sub.id);
                                          if (e.key === "Escape") setEditingScore(null);
                                        }}
                                      />
                                      <button
                                        onClick={() => saveScore(sub.id)}
                                        disabled={savingScore}
                                        className="px-2.5 py-1 rounded bg-emerald-600 text-white font-mono text-xs font-bold"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={() => setEditingScore(null)}
                                        className="px-2.5 py-1 rounded bg-slate-200 text-slate-700 font-mono text-xs"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEditingScore(sub.id);
                                        setScoreValue(
                                          sub.score !== null ? String(sub.score) : ""
                                        );
                                      }}
                                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition-all ${
                                        sub.score !== null
                                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                          : "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100"
                                      }`}
                                    >
                                      {sub.score !== null ? (
                                        <span>{sub.score} / {TASK_POINTS}</span>
                                      ) : (
                                        <span>Assign Score</span>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Answer Text Area */}
                              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-sm font-display text-slate-800 whitespace-pre-wrap leading-relaxed">
                                {sub.answer}
                              </div>

                              {/* Links Rendering */}
                              {(() => {
                                let instaUrl = "";
                                let linkedUrl = "";
                                if (sub.answer) {
                                  const im = sub.answer.match(/Instagram:\s*(https:\/\/[^\s\n]+)/i);
                                  if (im) instaUrl = im[1];
                                  const lm = sub.answer.match(/LinkedIn:\s*(https:\/\/[^\s\n]+)/i);
                                  if (lm) linkedUrl = lm[1];
                                }
                                if (!instaUrl && sub.link && /^https:\/\/(www\.)?instagram\.com\//i.test(sub.link)) {
                                  instaUrl = sub.link;
                                }
                                if (!linkedUrl && sub.link && /^https:\/\/(www\.)?linkedin\.com\//i.test(sub.link)) {
                                  linkedUrl = sub.link;
                                }

                                if (instaUrl || linkedUrl) {
                                  return (
                                    <div className="flex flex-wrap gap-2 mt-2.5">
                                      {instaUrl && (
                                        <a
                                          href={instaUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition-colors"
                                        >
                                          <span>📸 Instagram Post:</span>
                                          <span className="truncate max-w-xs">{instaUrl}</span>
                                        </a>
                                      )}
                                      {linkedUrl && (
                                        <a
                                          href={linkedUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 transition-colors"
                                        >
                                          <span>💼 LinkedIn Post:</span>
                                          <span className="truncate max-w-xs">{linkedUrl}</span>
                                        </a>
                                      )}
                                    </div>
                                  );
                                }

                                if (sub.link) {
                                  return (
                                    <a
                                      href={sub.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-mono text-teal-700 hover:underline mt-2.5"
                                    >
                                      <span>🔗 External URL:</span>
                                      <span className="truncate max-w-md">{sub.link}</span>
                                    </a>
                                  );
                                }

                                return null;
                              })()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                  Upload your registered teams CSV. Replaces all rows in the &quot;registrations&quot; table in a single atomic transaction without touching submissions or any other tables.
                </p>
              </div>
              {currentRegStats && (
                <div className="px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 font-mono text-xs">
                  Active Teams: <strong>{currentRegStats.teamCount}</strong>
                </div>
              )}
            </div>

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
