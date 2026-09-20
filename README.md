# Tricity Tasks

A team challenge platform where members complete daily tasks, submit answers, and compete for the highest score. Built with **Next.js 16** (App Router, TypeScript, Tailwind CSS v4) and **Supabase** (Postgres).

---

## Features

- **5 Task Cards** — Admin toggles tasks ON/OFF. Locked tasks are hidden from participants.
- **Team Submissions** — Members join with a Team ID + Name. Each member can submit each task once.
- **Duplicate Prevention** — Server-side checks + database UNIQUE constraint.
- **Admin Panel** (`/admin`) — Password-protected. Toggle tasks, view leaderboard, score submissions (0–100 per task, 500 total).
- **Cookie Persistence** — Team ID and name saved in cookies for returning members.
- **Mobile Friendly** — Responsive dark-themed UI.

---

## Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd tricity-tasks
npm install
```

### 2. Supabase Database

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** and run the contents of [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy your **Project URL** and **Service Role Key** from Settings → API.

### 3. Environment Variables

Create a `.env.local` file in the project root:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=your-admin-password
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy to Vercel

### Option A: Vercel Dashboard

1. Push the repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Add environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`) in the project settings.
4. Deploy.

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel
# Follow prompts, then set env vars:
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ADMIN_PASSWORD
vercel --prod
```

---

## Database Schema

| Table | Columns |
|---|---|
| `tasks` | `id`, `title`, `description`, `is_active` |
| `submissions` | `id`, `team_id`, `member_name`, `member_name_normalized`, `task_id`, `answer`, `link`, `score` (0–100), `created_at`, **UNIQUE**(`team_id`, `member_name_normalized`, `task_id`) |

No separate teams table — teams are derived from submissions.

---

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/tasks` | GET | List all tasks with status |
| `/api/tasks/[id]/start` | POST | Validate team + member, set cookies |
| `/api/tasks/[id]/submit` | POST | Submit answer (enforces uniqueness) |
| `/api/tasks/[id]/status` | GET | Check if member already submitted |
| `/api/admin/login` | POST | Admin password login |
| `/api/admin/logout` | POST | Clear admin session |
| `/api/admin/teams` | GET | Leaderboard (members, submissions, scores) |
| `/api/admin/teams/[teamId]` | GET | Team submissions detail |
| `/api/admin/submissions/[id]/score` | PATCH | Set/update score |
| `/api/admin/tasks/[id]/toggle` | PATCH | Toggle task ON/OFF |

---

## Pages

| Path | Description |
|---|---|
| `/` | Home — Task cards with Start buttons |
| `/task/[id]` | Task detail + submission form |
| `/admin` | Admin login, task toggles, leaderboard, scoring |
