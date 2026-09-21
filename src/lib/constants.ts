/**
 * Virtual Hackathon 2K26 Scoring Constants
 */
export const MAX_SCORE = 100;
export const TASK_POINTS = 20;
export const TOTAL_TASKS = 5;

export const FUTURE_PLAN_OPTIONS = [
  "Study abroad",
  "Study in India (M.Tech/MBA)",
  "Placement / job in India",
  "Entrepreneurship",
  "Upskilling",
  "Others (please specify)",
] as const;

/**
 * Cleanly round to at most 1 decimal place with no floating point noise (e.g. 19.999 -> 20)
 */
export function roundScore(val: number): number {
  if (isNaN(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10) / 10;
}

/**
 * Clamp score between 0 and MAX_SCORE
 */
export function clampScore(val: number, max = MAX_SCORE): number {
  return Math.min(max, Math.max(0, roundScore(val)));
}
