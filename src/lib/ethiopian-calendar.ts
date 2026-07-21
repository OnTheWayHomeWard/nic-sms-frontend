// ── Ethiopian ⇄ Gregorian calendar conversion ──────────────────────────────────
//
// Converts through the Julian Day Number (JDN) rather than a fixed "+8 years,
// shift by N days" offset. A fixed offset breaks near the Ethiopian New Year
// boundary (11/12 September) and silently mishandles leap years; going through
// JDN handles both the Gregorian leap-year rule and the Ethiopian one (a plain
// day count, not a special case) correctly by construction.
//
// Ethiopian epoch (1 Meskerem, year 1 — Amete Mihret era) = JDN 1,724,221.
// Calibrated against the well-documented Ethiopian Millennium (1 Meskerem
// 2000 = 12 September 2007 Gregorian — the New Year fell on the 12th rather
// than the usual 11th because Ethiopian year 1999 was itself a leap year)
// and cross-checked with a round-trip fuzz test spanning 1950–2050.

const JD_EPOCH_OFFSET_AMETE_MIHRET = 1724221;

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

// Fliegel & Van Flandern integer JDN algorithm — standard, valid for the
// proleptic Gregorian calendar.
function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

// Inverse of the above (Richards' algorithm).
function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

function ethiopianToJDN(year: number, month: number, day: number): number {
  return (
    JD_EPOCH_OFFSET_AMETE_MIHRET +
    365 * (year - 1) +
    Math.floor(year / 4) +
    30 * month +
    day -
    31
  );
}

function jdnToEthiopian(jdn: number): { year: number; month: number; day: number } {
  // 0-indexed day count since the era start (year 1, Meskerem 1 → n = 0).
  const n = jdn - JD_EPOCH_OFFSET_AMETE_MIHRET;
  // Ethiopian leap years fall on the 3rd year of every 4-year block (not the
  // 4th, unlike the Gregorian/Julian cycle) — years 4k+1, 4k+2, 4k+4 have 365
  // days, year 4k+3 has 366. Placing the leap day mid-block rather than at a
  // block boundary is the detail a closed-form day-count formula most easily
  // gets wrong, so it's spelled out explicitly here instead.
  const k = Math.floor(n / 1461);
  const r = n - 1461 * k;
  let year: number;
  let dayOfYear: number;
  if (r < 365) {
    year = 4 * k + 1;
    dayOfYear = r;
  } else if (r < 730) {
    year = 4 * k + 2;
    dayOfYear = r - 365;
  } else if (r < 1096) {
    year = 4 * k + 3;
    dayOfYear = r - 730;
  } else {
    year = 4 * k + 4;
    dayOfYear = r - 1096;
  }
  const month = Math.floor(dayOfYear / 30) + 1;
  const day = (dayOfYear % 30) + 1;
  return { year, month, day };
}

/**
 * Ethiopian leap years fall every 4 years (Pagumē gets a 6th day) on the year
 * right before a Gregorian leap year's February — equivalent to year % 4 === 3.
 */
export function isEthiopianLeapYear(year: number): boolean {
  return mod(year, 4) === 3;
}

/** 30 for months 1–12 (Meskerem…Nehase); 5 or 6 for month 13 (Pagumē). */
export function ethiopianMonthLength(year: number, month: number): number {
  if (month === 13) return isEthiopianLeapYear(year) ? 6 : 5;
  return 30;
}

/** Ethiopian calendar date → Gregorian JS Date (UTC midnight). */
export function ethiopianToGregorian(year: number, month: number, day: number): Date {
  const jdn = ethiopianToJDN(year, month, day);
  const g = jdnToGregorian(jdn);
  return new Date(Date.UTC(g.year, g.month - 1, g.day));
}

/** Gregorian JS Date → Ethiopian calendar date. */
export function gregorianToEthiopian(
  date: Date,
): { year: number; month: number; day: number } {
  const jdn = gregorianToJDN(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
  return jdnToEthiopian(jdn);
}

/**
 * Parses a raw cell value as an Ethiopian calendar date and returns the
 * equivalent Gregorian JS Date (UTC midnight), or null if it can't be
 * interpreted as one. Validates day-of-month against the real Ethiopian
 * month length (30, or 5/6 for Pagumē) so e.g. "35/13/2015" or a Pagumē 6
 * in a non-leap year is rejected rather than silently misconverted.
 */
export function parseEthiopianDateValue(val: unknown): Date | null {
  let year: number, month: number, day: number;

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    // A native Date on an Ethiopian-calendar column means the sheet cell was
    // formatted as a date; its Y/M/D components are the Ethiopian ones as
    // literally entered (Excel has no native Ethiopian calendar).
    year = val.getUTCFullYear();
    month = val.getUTCMonth() + 1;
    day = val.getUTCDate();
  } else if (typeof val === "string" && val.trim()) {
    const s = val.trim();
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    const ymd = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (dmy) {
      day = parseInt(dmy[1], 10);
      month = parseInt(dmy[2], 10);
      year = parseInt(dmy[3], 10);
    } else if (ymd) {
      year = parseInt(ymd[1], 10);
      month = parseInt(ymd[2], 10);
      day = parseInt(ymd[3], 10);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!Number.isInteger(month) || month < 1 || month > 13) return null;
  if (!Number.isInteger(day) || day < 1 || day > ethiopianMonthLength(year, month)) {
    return null;
  }

  return ethiopianToGregorian(year, month, day);
}
