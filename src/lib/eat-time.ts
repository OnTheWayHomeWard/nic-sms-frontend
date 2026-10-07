// Audit timestamps are stored as UTC instants and always shown in Ethiopian
// local time (Africa/Addis_Ababa, EAT = UTC+3) regardless of the browser's
// own time zone, so everyone reading the log sees the same wall-clock time.

export const EAT_TIME_ZONE = "Africa/Addis_Ababa";
export const EAT_LABEL = "EAT";

const fullFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: EAT_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const shortFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: EAT_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "07 Oct 2026, 14:03:22 EAT" */
export function formatEat(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fullFmt.format(d)} ${EAT_LABEL}`;
}

/** "7 Oct, 14:03 EAT" */
export function formatEatShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${shortFmt.format(d)} ${EAT_LABEL}`;
}

/**
 * Converts a "YYYY-MM-DD" calendar date picked by the user (understood as an
 * EAT date) into the UTC instant at the start (or end) of that EAT day.
 */
export function eatDateToUtcIso(date: string, endOfDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const time = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  // EAT has no daylight saving: a fixed +03:00 offset is exact.
  return new Date(`${date}${time}+03:00`).toISOString();
}
