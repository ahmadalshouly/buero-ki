import { daysUntil } from "./i18n";
import type { Task } from "./types";

export type Bucket = "overdue" | "today" | "week" | "later" | "noDate";

export function bucketOf(task: Pick<Task, "due_date">): Bucket {
  if (!task.due_date) return "noDate";
  const d = daysUntil(task.due_date);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}

/** Accepts YYYY-MM-DD for a real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
