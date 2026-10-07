// SMS encoding detection and segment counting.
//
// This is a line-for-line mirror of the backend's
//   esms-common/.../sms/Gsm0338.java     (alphabet tables, septet costs, splitting)
//   esms-common/.../sms/SmsSegments.java (limits, detection, count, info)
// which decide the encoding and the segment_count billing reads. Keep the
// constants and tables identical; if one side changes, change the other.
//
// Rules:
//   * GSM-7 when every character is in the GSM 03.38 basic or extension table,
//     otherwise UCS-2 (any Amharic/Ge'ez letter, emoji, curly quote, ...).
//   * GSM-7: 160 septets in one SMS, 153 per part when concatenated. The
//     extension characters  € [ ] { } ^ ~ | \  and form feed cost 2 septets.
//   * UCS-2: 70 UTF-16 code units in one SMS, 67 per part. An emoji (surrogate
//     pair) costs 2.
//   * A part never ends between an ESC and its extension char, nor inside a
//     surrogate pair, so the count comes from actually splitting, not ceil().

export type SmsEncoding = "GSM7" | "UCS2";

export const MAX_GSM7 = 160;
export const MAX_UCS2 = 70;
export const SEG_GSM7 = 153;
export const SEG_UCS2 = 67;
/** Longest message the backend accepts (SmsSegments.MAX_SEGMENTS). */
export const MAX_SEGMENTS = 10;

// GSM 03.38 basic table: index = code point. 0x1B (ESC) is not encodable.
const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå" + // 0x00-0x0F
  "Δ_ΦΓΛΩΠΨΣΘΞ\u001BÆæßÉ" + // 0x10-0x1F
  " !\"#¤%&'()*+,-./" + // 0x20-0x2F
  "0123456789:;<=>?" + // 0x30-0x3F
  "¡ABCDEFGHIJKLMNO" + // 0x40-0x4F
  "PQRSTUVWXYZÄÖÑÜ§" + // 0x50-0x5F
  "¿abcdefghijklmno" + // 0x60-0x6F
  "pqrstuvwxyzäöñüà"; // 0x70-0x7F

const BASIC_SET = new Set<string>(
  BASIC.split("").filter((_, i) => i !== 0x1b),
);

// Extension table (each sent as ESC + char, 2 septets).
const EXTENDED_SET = new Set<string>([
  "\f",
  "^",
  "{",
  "}",
  "\\",
  "[",
  "~",
  "]",
  "|",
  "€",
]);

/** Septets for one UTF-16 code unit: 1 basic, 2 extended, 0 not GSM. */
function septetCost(c: string): number {
  if (BASIC_SET.has(c)) return 1;
  if (EXTENDED_SET.has(c)) return 2;
  return 0;
}

export function isGsmEncodable(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (septetCost(text[i]) === 0) return false;
  }
  return true;
}

export function septetLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) n += septetCost(text[i]);
  return n;
}

export function detectEncoding(text: string): SmsEncoding {
  return isGsmEncodable(text) ? "GSM7" : "UCS2";
}

/** Gsm0338.splitBySeptets: never separates an ESC pair. */
export function splitBySeptets(text: string, maxSeptets: number): string[] {
  const parts: string[] = [];
  let current = "";
  let septets = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const cost = septetCost(c);
    if (septets + cost > maxSeptets && current.length > 0) {
      parts.push(current);
      current = "";
      septets = 0;
    }
    current += c;
    septets += cost;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

/** Gsm0338.splitByCodeUnits: never breaks a surrogate pair. */
export function splitByCodeUnits(text: string, maxUnits: number): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxUnits, text.length);
    if (end < text.length) {
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    parts.push(text.substring(start, end));
    start = end;
  }
  return parts;
}

/** SmsSegments.count: number of SMS the handset receives. */
export function countSegments(text: string, encoding = detectEncoding(text)): number {
  if (!text) return 1;
  if (encoding === "UCS2") {
    return text.length <= MAX_UCS2 ? 1 : splitByCodeUnits(text, SEG_UCS2).length;
  }
  return septetLength(text) <= MAX_GSM7 ? 1 : splitBySeptets(text, SEG_GSM7).length;
}

export interface SmsInfo {
  encoding: SmsEncoding;
  /** Length in the encoding's units: septets (GSM-7) or code units (UCS-2). */
  units: number;
  segments: number;
  /** Limit per segment in force: 160/70 single, 153/67 concatenated. */
  perSegment: number;
  /** Units left before another segment starts. */
  remaining: number;
  /** True when over MAX_SEGMENTS (the backend will reject it). */
  tooLong: boolean;
}

/** SmsSegments.info. */
export function smsInfo(text: string): SmsInfo {
  const body = text ?? "";
  const encoding = detectEncoding(body);
  const ucs2 = encoding === "UCS2";
  const units = ucs2 ? body.length : septetLength(body);
  const single = ucs2 ? MAX_UCS2 : MAX_GSM7;
  const multi = ucs2 ? SEG_UCS2 : SEG_GSM7;
  const segments = countSegments(body, encoding);
  const perSegment = segments <= 1 ? single : multi;
  const remaining = Math.max(
    0,
    segments <= 1 ? single - units : multi * segments - units,
  );
  return {
    encoding,
    units,
    segments,
    perSegment,
    remaining,
    tooLong: segments > MAX_SEGMENTS,
  };
}

/** Human label for an encoding. */
export function encodingLabel(e: SmsEncoding | string | null | undefined): string {
  return e === "UCS2" ? "UCS-2" : "GSM-7";
}

/** Placeholders the dispatcher substitutes per recipient, e.g. ${name}. */
export function hasPlaceholders(text: string): boolean {
  return /\$\{[^}]+\}|\{\{[^}]+\}\}/.test(text);
}
