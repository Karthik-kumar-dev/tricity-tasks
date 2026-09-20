import fs from "fs";
import path from "path";

export interface TaskOverrides {
  rules?: string | null;
  linkedin_template?: string | null;
  title?: string;
  description?: string;
}

const DEFAULT_LINKEDIN_TEMPLATE = `I'm officially registered for the TRI-CITY AI HACKATHON 2026! 🚀

Name : {name}
College : {college}
Where : Warangal · Hanamkonda · Kazipet
When : October 10 - 11, 2026 | 24-hour sprint

Excited to collaborate, build cutting-edge AI solutions, and compete with top talent across the Tri-City region. Let's make it happen!

#TriCityAIHackathon #Centle #WarangalTech #AI #Hackathon #Innovation #StudentDevelopers`;

export function getDefaultRules(taskId: number): string {
  switch (taskId) {
    case 1:
      return [
        "1. Profile Photo: Upload a high-quality front-facing photo and crop it to fit inside the circular badge frame.",
        "2. Participant Details: Ensure your full name and college name are spelled correctly before generating your badge.",
        "3. Download Poster: Generate and download the official high-resolution registration poster image.",
        "4. LinkedIn Sharing: Post the poster to your LinkedIn profile using the provided caption. Tag @Tri-City Hackathon and @Centle.",
        "5. Submit Post URL: Copy the public link to your live LinkedIn post and submit it below to register your completion and claim points.",
        "6. Verification & Fair Play: Each participant submits once. The LinkedIn post must remain public until evaluations conclude. Invalid or broken URLs will be awarded zero points.",
      ].join("\n");
    case 2:
      return [
        "1. Team Identification: Submit under your registered Team ID (starts with TRI-) and your official name.",
        "2. Independent Analysis: Perform queries or data inspection independently; explain the exact filter or methodology used.",
        "3. Verifiable Proof: Submit the extracted signal and include code/query snippets or reference sources.",
        "4. Plagiarism Penalty: Any copied solutions or unauthorized cross-team sharing will result in disqualification.",
      ].join("\n");
    case 3:
      return [
        "1. Step-by-Step Logic: Provide the complete sequence of deductions from clue to suspect.",
        "2. No Pure Guesses: Solutions without clear elimination steps will not receive full credit.",
        "3. Individual Submission: Each member may submit their solution once.",
      ].join("\n");
    case 4:
      return [
        "1. Code Quality & Performance: Provide clean, idiomatic code with optimal time and space complexity.",
        "2. Test Verification: Your code will be evaluated against edge cases, including empty inputs and large volumes.",
        "3. Explanation: Briefly explain your approach, data structures chosen, and any trade-offs considered.",
      ].join("\n");
    case 5:
      return [
        "1. Multi-Disciplinary Challenge: Synthesize answers and cryptographic tokens discovered across previous tasks.",
        "2. Exact Match: The final answer must match the requested format precisely.",
        "3. Final Deadline: Submissions close strictly at the tournament sprint buzzer.",
      ].join("\n");
    default:
      return [
        "1. Team Verification: Submit with your registered Team ID and member name.",
        "2. One Submission: Each member can submit once per challenge.",
        "3. Academic Integrity: Plagiarized or duplicated solutions will be disqualified immediately.",
        "4. Format: Clearly explain your solution steps and provide links if demo/code is required.",
      ].join("\n");
  }
}

export function getDefaultLinkedInTemplate(): string {
  return DEFAULT_LINKEDIN_TEMPLATE;
}

const CONFIG_FILE_PATH = path.join(process.cwd(), "data", "task_config.json");

function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

export function getLocalOverrides(): Record<number, TaskOverrides> {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const content = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Return empty on read failure
  }
  return {};
}

export function saveLocalOverride(taskId: number, data: TaskOverrides): void {
  try {
    ensureDirectoryExistence(CONFIG_FILE_PATH);
    const all = getLocalOverrides();
    all[taskId] = {
      ...all[taskId],
      ...data,
    };
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(all, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write task override locally:", err);
  }
}

/**
 * Resolves the rules and linkedin template for a task:
 * 1. Database value if non-empty string
 * 2. Local config file override if exists
 * 3. Default rule/template for the given taskId
 */
export function resolveTaskRulesAndTemplate(task: {
  id: number;
  rules?: string | null;
  linkedin_template?: string | null;
}): { rules: string; linkedin_template: string } {
  const local = getLocalOverrides()[task.id] || {};

  const rules =
    (task.rules && task.rules.trim()) ||
    (local.rules && local.rules.trim()) ||
    getDefaultRules(task.id);

  const linkedin_template =
    (task.linkedin_template && task.linkedin_template.trim()) ||
    (local.linkedin_template && local.linkedin_template.trim()) ||
    (task.id === 1 ? getDefaultLinkedInTemplate() : "");

  return { rules, linkedin_template };
}
