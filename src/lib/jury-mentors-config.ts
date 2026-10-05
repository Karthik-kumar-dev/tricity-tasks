import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "data", "task_config.json");

interface ConfigData {
  [key: string]: any;
}

function readConfig(): ConfigData {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return {};
    }
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading task_config.json:", err);
    return {};
  }
}

function writeConfig(data: ConfigData) {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing task_config.json:", err);
  }
}

export function isJuryMentorsActive(): boolean {
  const config = readConfig();
  if (config.jury_mentors && typeof config.jury_mentors.is_active === "boolean") {
    return config.jury_mentors.is_active;
  }
  return true; // Active by default
}

export function toggleJuryMentorsActive(): boolean {
  const config = readConfig();
  const current = isJuryMentorsActive();
  const next = !current;
  config.jury_mentors = {
    ...(config.jury_mentors || {}),
    is_active: next,
    updated_at: new Date().toISOString(),
  };
  writeConfig(config);
  return next;
}

export function setJuryMentorsActive(active: boolean): boolean {
  const config = readConfig();
  config.jury_mentors = {
    ...(config.jury_mentors || {}),
    is_active: active,
    updated_at: new Date().toISOString(),
  };
  writeConfig(config);
  return active;
}
