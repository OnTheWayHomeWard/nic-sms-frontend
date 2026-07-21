// Shared platform model for templates and contact groups.
//
// Dynamic message variables ({{Name}}, {{PolicyNo}}, …) are derived from the
// column headers of an Excel file. A template carries the Excel that was
// uploaded when it was created, so anywhere a template is selected we can show
// that pre-uploaded file and offer its columns as variables. Contact groups
// likewise expose the headers of their source list.

export interface PlatformTemplate {
  value: string;
  label: string;
  body: string;
  /** Excel uploaded when the template was created. */
  excelFileName: string;
  /** Column headers of that Excel — the template's dynamic variables. */
  headers: string[];
  /** Recipient rows in the template's pre-uploaded Excel. */
  recipients: number;
}

export interface PlatformContactGroup {
  value: string;
  label: string;
  /** Source list file backing the group. */
  fileName: string;
  headers: string[];
  recipients: number;
}

export const PLATFORM_TEMPLATES: PlatformTemplate[] = [
  {
    value: "renewal-reminder",
    label: "Renewal Reminder",
    body: "Dear {{Name}}, your motor insurance policy {{PolicyNo}} expires on {{ExpiryDate}}. Renew at any Nib branch or call 8559.",
    excelFileName: "renewal_contacts_2026.xlsx",
    headers: ["Name", "PolicyNo", "ExpiryDate"],
    recipients: 1284,
  },
  {
    value: "holiday-message",
    label: "Holiday Message",
    body: "Dear {{Name}}, wishing you a joyful holiday season from NibInsure! Your policy {{PolicyNo}} is active. Call 8559 for assistance.",
    excelFileName: "holiday_list_2026.xlsx",
    headers: ["Name", "PolicyNo"],
    recipients: 3402,
  },
  {
    value: "payment-due",
    label: "Payment Due",
    body: "Dear {{Name}}, your premium payment for policy {{PolicyNo}} is due on {{ExpiryDate}}. Please pay promptly to avoid policy lapse. Call 8559.",
    excelFileName: "payments_due_2026.xlsx",
    headers: ["Name", "PolicyNo", "ExpiryDate", "Amount"],
    recipients: 947,
  },
];

export const PLATFORM_CONTACT_GROUPS: PlatformContactGroup[] = [
  {
    value: "policy-holders-jan2025",
    label: "Policy Holders jan2025",
    fileName: "policy_holders_jan2025.xlsx",
    headers: ["Name", "PolicyNo", "ExpiryDate"],
    recipients: 1265,
  },
  {
    value: "policy-holders-feb2025",
    label: "Policy Holders feb2025",
    fileName: "policy_holders_feb2025.xlsx",
    headers: ["Name", "PolicyNo", "ExpiryDate"],
    recipients: 1402,
  },
  {
    value: "all-clients",
    label: "All Clients",
    fileName: "all_clients.xlsx",
    headers: ["Name", "Phone", "Branch"],
    recipients: 3847,
  },
];

export const DEFAULT_HEADERS = ["Name", "PolicyNo", "ExpiryDate"];

const DEFAULT_PREVIEW_VALUES: Record<string, string> = {
  Name: "Abebe Girma",
  PolicyNo: "NIC-MTR-00421",
  ExpiryDate: "April 30, 2026",
  Amount: "ETB 3,500",
  Phone: "+251911223344",
  Branch: "Bole",
  ClaimNo: "CLM-2025-0042",
};

/** `["Name","PolicyNo"]` → `["{{Name}}","{{PolicyNo}}"]` */
export function headersToVariables(headers: string[]): string[] {
  return headers.map((h) => `{{${h}}}`);
}

/** Build a `{{Var}} → sample value` map for live previews. */
export function sampleFromHeaders(headers: string[]): Record<string, string> {
  const sample: Record<string, string> = {};
  headers.forEach((h) => {
    sample[`{{${h}}}`] = DEFAULT_PREVIEW_VALUES[h] ?? h;
  });
  return sample;
}

/** A real contact record used to fill previews with actual values. */
export interface PreviewMember {
  phoneE164?: string;
  phone?: string;
  name?: string;
  [key: string]: string | null | undefined;
}

/**
 * Build a `{{Var}} → real value` map from an actual contact record, matching
 * each variable name to the member's data:
 *   1. exact field key (case-insensitive)
 *   2. phone-like names → member.phone ?? member.phoneE164
 *   3. name-like names  → member.name
 * Variables with no match are left out so the caller can decide the fallback.
 */
export function sampleFromMember(
  fields: string[],
  member: PreviewMember,
): Record<string, string> {
  // Case-insensitive lookup of every populated property on the record.
  const byLowerKey: Record<string, string> = {};
  Object.entries(member).forEach(([k, v]) => {
    if (v != null && String(v).trim() !== "")
      byLowerKey[k.toLowerCase().trim()] = String(v);
  });

  const phoneVal = member.phone ?? member.phoneE164 ?? undefined;
  const sample: Record<string, string> = {};
  fields.forEach((f) => {
    const key = f.toLowerCase().trim();
    let value: string | undefined = byLowerKey[key];
    if (value === undefined) {
      if (/phone|mobile|msisdn|cell|tel/.test(key)) value = phoneVal;
      else if (/name/.test(key)) value = member.name ?? undefined;
    }
    if (value !== undefined && value !== "") sample[`{{${f}}}`] = value;
  });
  return sample;
}
