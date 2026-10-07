"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  FileSpreadsheet,
  Info,
  Plus,
  Power,
  Search,
  SquarePen,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  TypographyH3,
  TypographyMuted,
  TypographySmall,
} from "@/components/ui/typography";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  headersToVariables,
  sampleFromHeaders,
} from "@/lib/templates";
import {
  apiErrorMessage,
  groupsApi,
  reminderTemplatesApi,
  remindersApi,
  type ApiGroup,
} from "@/lib/services";
import {
  ColumnMapDialog,
  type DateCalendar,
} from "@/components/ui/column-map-dialog";
import { parseEthiopianDateValue } from "@/lib/ethiopian-calendar";
import { SmsCounter } from "@/components/sms-counter";

// ── Types ──────────────────────────────────────────────────────────────────────

// A reminder TEMPLATE: the reusable definition users manage here. Sending one
// (with uploaded data) creates a separate approval-gated run in Campaign
// Management — that never surfaces on this page.
interface Reminder {
  id: string;
  name: string;
  triggerDays: number;
  message: string;
  status: string; // ACTIVE | INACTIVE
  headers: string[];
  sampleFileName?: string;
}

type ReminderSortField = "name" | "triggerDays" | null;

// ── Date parsing ───────────────────────────────────────────────────────────────

function parseFlexibleDate(val: unknown): Date | null {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    // Excel serial date: day 1 = Jan 1 1900, with leap-year bug (day 60 doesn't exist)
    const d = new Date(Date.UTC(1900, 0, 1) + (val - 2) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val !== "string" || !val.trim()) return null;
  const s = val.trim();

  // ISO / native parse (handles YYYY-MM-DD, YYYY/MM/DD via native, etc.)
  const native = new Date(s);
  if (!isNaN(native.getTime())) return native;

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const d2 = new Date(
      Date.UTC(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1])),
    );
    if (!isNaN(d2.getTime())) return d2;
  }

  return null;
}

/** Parses a raw cell value as a date in the given calendar, always returning
 * the equivalent Gregorian instant so downstream day-diff math never needs
 * to know which calendar the source data was in. */
function parseDateInCalendar(val: unknown, calendar: DateCalendar): Date | null {
  return calendar === "ethiopian"
    ? parseEthiopianDateValue(val)
    : parseFlexibleDate(val);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ReminderMatchStat {
  /** Rows expiring in exactly triggerDays that ALSO have a valid phone. */
  count: number;
  /** Matching rows dropped because their phone cell was empty. */
  invalidPhone: number;
  /** Valid-phone matching rows missing one or more message-variable values. */
  missingVars: number;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Case-insensitive lookup of a header's value in a row. */
function rowValue(row: Record<string, unknown>, header: string): unknown {
  if (header in row) return row[header];
  const lower = header.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return undefined;
}

function computeMatchCounts(
  reminders: { id: string; triggerDays: number; headers: string[] }[],
  rows: Record<string, unknown>[],
  dateCol: string,
  phoneCol: string,
  calendar: DateCalendar,
): Record<string, ReminderMatchStat> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const stats: Record<string, ReminderMatchStat> = {};
  for (const reminder of reminders) {
    // Only the reminder's actual message variables need to be non-empty —
    // the phone/date mapping columns are handled separately.
    const varHeaders = reminder.headers.filter(
      (h) => h !== phoneCol && h !== dateCol,
    );
    let count = 0;
    let invalidPhone = 0;
    let missingVars = 0;
    for (const row of rows) {
      const parsed = parseDateInCalendar(row[dateCol], calendar);
      if (!parsed) continue;
      const diffMs = parsed.getTime() - today.getTime();
      const daysUntilExpiry = Math.round(diffMs / 86400000);
      if (daysUntilExpiry !== reminder.triggerDays) continue;
      // Phone is the hard requirement — a matching row with no phone can't
      // be a recipient.
      if (isBlank(rowValue(row, phoneCol))) {
        invalidPhone++;
        continue;
      }
      count++;
      if (varHeaders.some((h) => isBlank(rowValue(row, h)))) missingVars++;
    }
    stats[reminder.id] = { count, invalidPhone, missingVars };
  }
  return stats;
}

function extractVariables(message: string): string[] {
  const matches = message.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

async function parseFileRows(
  file: File,
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: "",
          raw: true,
        });
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function buildMappedFile(
  fileName: string,
  rows: Record<string, unknown>[],
  phoneCol: string,
  dateCol: string,
  calendar: DateCalendar,
): File {
  const renamedRows = rows.map((row) => {
    const renamed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === phoneCol) {
        renamed["Phone"] = value;
      } else if (key === dateCol) {
        // The backend's own expiry scan presumably assumes Gregorian dates,
        // so an Ethiopian-calendar source column is converted here rather
        // than uploaded as-is.
        renamed["ExpiryDate"] =
          calendar === "ethiopian"
            ? (parseEthiopianDateValue(value) ?? value)
            : value;
      } else {
        renamed[key] = value;
      }
    }
    return renamed;
  });
  const ws = XLSX.utils.json_to_sheet(renamedRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([out], fileName, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function checkCompatibility(
  reminderHeaders: string[],
  uploadedHeaders: string[],
): { compatible: boolean; missing: string[] } {
  if (uploadedHeaders.length === 0) return { compatible: true, missing: [] };
  const lowerUploaded = uploadedHeaders.map((h) => h.toLowerCase());
  const missing = reminderHeaders.filter(
    (h) => !lowerUploaded.includes(h.toLowerCase()),
  );
  return { compatible: missing.length === 0, missing };
}

function resolvePreviewNodes(
  text: string,
  sample: Record<string, string>,
): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    sample[part] !== undefined ? <strong key={i}>{sample[part]}</strong> : part,
  );
}

// ── ReminderFormDialog ─────────────────────────────────────────────────────────

interface ReminderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialReminder?: Reminder;
  groups: ApiGroup[];
  onSave: (
    data: Pick<
      Reminder,
      "name" | "triggerDays" | "message" | "headers" | "sampleFileName"
    >,
  ) => void;
}

function ReminderFormDialog({
  open,
  onOpenChange,
  mode,
  initialReminder,
  groups,
  onSave,
}: ReminderFormProps) {
  const [formName, setFormName] = React.useState(initialReminder?.name ?? "");
  const [formDays, setFormDays] = React.useState(
    String(initialReminder?.triggerDays ?? ""),
  );
  const [formMessage, setFormMessage] = React.useState(
    initialReminder?.message ?? "",
  );
  const [formHeaders, setFormHeaders] = React.useState<string[]>(
    initialReminder?.headers ?? [],
  );
  const [sampleFileName, setSampleFileName] = React.useState(
    initialReminder?.sampleFileName ?? "",
  );
  const [dataSource, setDataSource] = React.useState<"sample" | "group">(
    "sample",
  );
  const [groupId, setGroupId] = React.useState("");
  const [sampleUploading, setSampleUploading] = React.useState(false);
  const [formFirstRow, setFormFirstRow] = React.useState<Record<string, string>>({});

  const sampleInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const previewSample = React.useMemo(
    () => sampleFromHeaders(formHeaders),
    [formHeaders],
  );
  const previewNodes = React.useMemo(
    () =>
      resolvePreviewNodes(
        formMessage,
        Object.keys(formFirstRow).length ? formFirstRow : previewSample,
      ),
    [formMessage, previewSample, formFirstRow],
  );
  const variables = headersToVariables(formHeaders);
  const hasHeaders = formHeaders.length > 0;

  function insertVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) {
      setFormMessage((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? formMessage.length;
    const end = el.selectionEnd ?? formMessage.length;
    setFormMessage(
      formMessage.slice(0, start) + variable + formMessage.slice(end),
    );
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function handleSampleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const isExcel =
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls") ||
      file.type.includes("spreadsheet") ||
      file.type === "application/vnd.ms-excel";
    if (!isExcel) {
      toast.error("Please upload an Excel file (.xlsx or .xls).", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }

    setSampleUploading(true);
    parseFileRows(file)
      .then(({ headers, rows }) => {
        if (headers.length === 0) {
          toast.error("No column headers found. Check your file.", {
            icon: <XCircle className="size-4" strokeWidth={2.5} />,
            duration: 7000,
          });
          return;
        }
        setFormHeaders(headers);
        setSampleFileName(file.name);
        // Build first-row preview so the live preview shows real data
        if (rows.length > 0) {
          const first = rows[0];
          const preview: Record<string, string> = {};
          Object.entries(first).forEach(([k, v]) => {
            preview[`{{${k}}}`] = String(
              v instanceof Date ? v.toLocaleDateString() : (v ?? ""),
            );
          });
          setFormFirstRow(preview);
        }
        toast.success(
          `Loaded ${headers.length} column${headers.length !== 1 ? "s" : ""} from "${file.name}".`,
          { icon: <CheckCircle2 className="size-4" strokeWidth={2.5} /> },
        );
      })
      .catch(() => {
        toast.error("Failed to read the file. Please try again.", {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      })
      .finally(() => setSampleUploading(false));
  }

  function handleGroupSelect(id: string | null) {
    if (!id) return;
    setGroupId(id);
    const grp = groups.find((g) => g.id === id);
    if (!grp) return;
    setFormHeaders(grp.fields);
    setSampleFileName(grp.name);
    setFormFirstRow({});
  }

  function handleSave() {
    const days = parseInt(formDays, 10);
    const missing: string[] = [];
    if (!formName.trim()) missing.push("a reminder name");
    if (!formMessage.trim()) missing.push("a message");
    if (isNaN(days) || days < 1) missing.push("a valid number of days (≥ 1)");
    if (!hasHeaders)
      missing.push("a sample file or contact group to define variables");
    if (missing.length > 0) {
      toast.error(`Please provide ${missing.join(", ")}.`, {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }
    onSave({
      name: formName.trim(),
      triggerDays: days,
      message: formMessage.trim(),
      headers: formHeaders,
      sampleFileName,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0" guideId="reminder-form">
          <DialogTitle className="text-xl font-bold">
            {mode === "create" ? "Create Reminder" : "Edit Reminder"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {mode === "create"
              ? "Set up a new automated reminder."
              : "Update this reminder."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 pt-6 space-y-6">

            {/* ── Step 1: Define variables ── */}
            <div className="rounded-lg border bg-accent/20 p-4 space-y-3" data-guide="rf-source">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-sm">Define variables</p>
                  <TypographyMuted className="text-xs mt-0.5">
                    Upload a sample Excel file or pick a contact group to
                    extract column names.{" "}
                    <span className="font-medium text-foreground/70">
                      When sending, you must upload fresh policy data each time
                      — this defines the available variables only.
                    </span>
                  </TypographyMuted>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant={dataSource === "sample" ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setDataSource("sample")}
                  >
                    Use sample file
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={dataSource === "group" ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setDataSource("group")}
                  >
                    Use contact group
                  </Button>
                </div>
              </div>

              {dataSource === "sample" ? (
                <>
                  <input
                    ref={sampleInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleSampleUpload}
                  />
                  {hasHeaders && sampleFileName ? (
                    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                      <FileSpreadsheet className="size-4 shrink-0 text-green-600" />
                      <span className="text-xs font-medium truncate flex-1">
                        {sampleFileName}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formHeaders.length} columns
                      </span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => {
                          setFormHeaders([]);
                          setSampleFileName("");
                        }}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      disabled={sampleUploading}
                      onClick={() => sampleInputRef.current?.click()}
                    >
                      <UploadCloud className="size-4" />
                      {sampleUploading
                        ? "Reading columns…"
                        : "Upload sample Excel to define variables"}
                    </Button>
                  )}
                </>
              ) : (
                <SearchableSelect
                  items={groups.map((g) => ({ value: g.id, label: g.name }))}
                  value={groupId}
                  onValueChange={handleGroupSelect}
                  placeholder="Choose a contact group…"
                  searchPlaceholder="Search contact groups…"
                  emptyText="No contact groups found."
                  className="h-9 text-xs"
                />
              )}

              {hasHeaders && (
                <div className="flex flex-wrap gap-1.5">
                  {formHeaders.map((h) => (
                    <span
                      key={h}
                      className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium"
                    >
                      {`{{${h}}}`}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Name + Days | Message ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* Left: Name + Days */}
              <div className="pb-6 md:pb-6 md:pr-6 space-y-5">
                <div className="space-y-2" data-guide="rf-name">
                  <Label htmlFor="rm-name">
                    Reminder Name{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="rm-name"
                    placeholder="e.g. Policy Holders Jan2025"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>

                <div className="space-y-2" data-guide="rf-days">
                  <Label htmlFor="rm-days">
                    Days before expiry{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="rm-days"
                    type="number"
                    min={1}
                    placeholder="30"
                    value={formDays}
                    onChange={(e) => setFormDays(e.target.value)}
                  />
                  <TypographyMuted className="text-xs">
                    When you click Send Now, SMS goes to contacts whose policy
                    expires in exactly this many days from the uploaded file.
                  </TypographyMuted>
                </div>
              </div>

              {/* Right: Message */}
              <div className="pt-6 md:pt-0 md:pl-6 space-y-3">
                <div>
                  <p className="font-semibold text-base">Reminder message</p>
                  <TypographyMuted className="text-sm">
                    Write message format
                  </TypographyMuted>
                </div>

                <div className="space-y-1.5" data-guide="rf-message">
                  <Label htmlFor="rm-message">
                    Message Text{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="rm-message"
                    ref={textareaRef}
                    placeholder="Dear {{Name}}, …"
                    rows={5}
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="resize-none"
                  />
                </div>

                <div className="flex items-start justify-between flex-wrap gap-2">
                  <SmsCounter text={formMessage} />
                  {variables.length > 0 ? (
                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {variables.map((v) => (
                        <Button
                          key={v}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => insertVariable(v)}
                        >
                          + {v}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <TypographyMuted className="text-xs italic">
                      Upload a sample file above to get variable buttons.
                    </TypographyMuted>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* ── Live Preview ── */}
            <div className="space-y-3 pb-6">
              <div>
                <p className="font-semibold text-base">Live Preview</p>
                <TypographyMuted>
                  Preview of message (Contacts view)
                </TypographyMuted>
              </div>

              <div className="rounded-lg border bg-accent/20 p-4 space-y-2.5 min-h-20">
                <TypographySmall className="font-medium text-muted-foreground">
                  FROM: NibInsure (8559)
                </TypographySmall>
                {formMessage.trim() ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {previewNodes}
                  </p>
                ) : (
                  <TypographyMuted className="italic text-sm">
                    Start typing a message to see the preview.
                  </TypographyMuted>
                )}
              </div>

              <TypographyMuted className="text-xs">
                {hasHeaders
                  ? "Sample values from your defined columns · row 1"
                  : "Define variables above to populate sample values"}
              </TypographyMuted>
            </div>
          </div>
        </ScrollArea>

        <div className="px-6 pb-6 pt-2 shrink-0 flex justify-end">
          <Button size="lg" onClick={handleSave}>
            {mode === "create" ? "Create Reminder" : "Save Reminder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ReminderPage ───────────────────────────────────────────────────────────────

export default function ReminderPage() {
  const [reminders, setReminders] = React.useState<Reminder[]>([]);
  const [remindersLoading, setRemindersLoading] = React.useState(true);
  const [groups, setGroups] = React.useState<ApiGroup[]>([]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createKey, setCreateKey] = React.useState(0);
  const [editTarget, setEditTarget] = React.useState<Reminder | null>(null);
  const [editKey, setEditKey] = React.useState(0);
  const [deactivateTarget, setDeactivateTarget] =
    React.useState<Reminder | null>(null);
  const [reactivateTarget, setReactivateTarget] =
    React.useState<Reminder | null>(null);
  const [reactivating, setReactivating] = React.useState(false);
  // Templates selected for this send. Purely local UI state — checking a box
  // calls no backend endpoint; pressing Send creates the runs.
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // ── Template list search / filter / sort ──
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "ACTIVE" | "INACTIVE">("all");
  const [sortField, setSortField] = React.useState<ReminderSortField>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  React.useEffect(() => {
    groupsApi.list().then(setGroups).catch(() => {});
    reminderTemplatesApi
      .list()
      .then((data) => {
        setReminders(
          data.map((r) => ({
            id: r.id,
            name: r.name,
            triggerDays: r.triggerDays,
            message: r.customBody ?? "",
            status: r.status,
            headers: extractVariables(r.customBody ?? ""),
          })),
        );
      })
      .catch(() => {})
      .finally(() => setRemindersLoading(false));
  }, []);

  // Upload Policy Data state
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [uploadedHeaders, setUploadedHeaders] = React.useState<string[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Column mapping state
  const [columnMapOpen, setColumnMapOpen] = React.useState(false);
  const [fileRows, setFileRows] = React.useState<Record<string, unknown>[]>([]);
  const [fileHeaders, setFileHeaders] = React.useState<string[]>([]);
  const [columnMapping, setColumnMapping] = React.useState<{
    phoneCol: string;
    dateCol: string;
    calendar: DateCalendar;
  } | null>(null);
  const [reminderMatchCounts, setReminderMatchCounts] = React.useState<Record<string, ReminderMatchStat>>({});
  const [firstRowData, setFirstRowData] = React.useState<Record<string, string>>({});
  // File actually sent to the backend: raw upload with the mapped phone/date
  // columns renamed to the canonical headers ("Phone" / "ExpiryDate") the
  // reminder system expects, so the mapping the user picked is what gets used.
  const [processedFile, setProcessedFile] = React.useState<File | null>(null);
  // File selected but not yet confirmed via the column-map dialog. Nothing is
  // attached/uploaded until the user presses Confirm; Cancel just drops this.
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);

  const hasFile = !!uploadedFile;
  const fileReady = hasFile && !!columnMapping;


  // Selecting a template for this send is a pure local toggle — checking a box
  // calls no backend endpoint. Only ACTIVE, compatible templates are
  // selectable (a deactivated template can't be sent).
  function toggleSelected(id: string) {
    if (!fileReady) return;
    const r = reminders.find((rem) => rem.id === id);
    if (!r || r.status !== "ACTIVE") return;
    if (!selectedIds.has(id) && !checkCompatibility(r.headers, uploadedHeaders).compatible) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(
    data: Pick<
      Reminder,
      "name" | "triggerDays" | "message" | "headers" | "sampleFileName"
    >,
  ) {
    try {
      const created = await reminderTemplatesApi.create({
        name: data.name,
        triggerDays: data.triggerDays,
        customBody: data.message,
        kind: "CUSTOM",
      });
      setReminders((prev) => [
        {
          id: created.id,
          name: created.name,
          triggerDays: created.triggerDays,
          message: created.customBody ?? "",
          status: created.status,
          headers: data.headers,
          sampleFileName: data.sampleFileName,
        },
        ...prev,
      ]);
      setCreateOpen(false);
      toast.success(`"${data.name}" created.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create reminder."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleEdit(
    data: Pick<
      Reminder,
      "name" | "triggerDays" | "message" | "headers" | "sampleFileName"
    >,
  ) {
    if (!editTarget) return;
    try {
      const updated = await reminderTemplatesApi.update(editTarget.id, {
        name: data.name,
        triggerDays: data.triggerDays,
        customBody: data.message,
      });
      setReminders((prev) =>
        prev.map((r) =>
          r.id === editTarget.id
            ? {
                ...r,
                name: updated.name,
                triggerDays: updated.triggerDays,
                message: updated.customBody ?? "",
                headers: data.headers,
                sampleFileName: data.sampleFileName,
              }
            : r,
        ),
      );
      // The message may reference different dynamic values now, so it's
      // unselected — the user must re-confirm it's compatible with the
      // currently uploaded file before it can send again.
      setSelectedIds((prev) => {
        if (!prev.has(editTarget.id)) return prev;
        const next = new Set(prev);
        next.delete(editTarget.id);
        return next;
      });
      // Recipient count depends on triggerDays and the message variables, both
      // of which may have changed — recompute against the uploaded file.
      if (columnMapping) {
        setReminderMatchCounts((prev) => ({
          ...prev,
          [editTarget.id]: computeMatchCounts(
            [{ id: editTarget.id, triggerDays: data.triggerDays, headers: data.headers }],
            fileRows,
            columnMapping.dateCol,
            columnMapping.phoneCol,
            columnMapping.calendar,
          )[editTarget.id],
        }));
      }
      setEditTarget(null);
      toast.success(`"${data.name}" updated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update reminder."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    try {
      await reminderTemplatesApi.deactivate(deactivateTarget.id);
      setReminders((prev) =>
        prev.map((r) =>
          r.id === deactivateTarget.id ? { ...r, status: "INACTIVE" } : r,
        ),
      );
      setSelectedIds((prev) => {
        if (!prev.has(deactivateTarget.id)) return prev;
        const next = new Set(prev);
        next.delete(deactivateTarget.id);
        return next;
      });
      setDeactivateTarget(null);
      toast.success(`"${deactivateTarget.name}" deactivated`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to deactivate reminder."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleReactivate() {
    if (!reactivateTarget) return;
    const reminder = reactivateTarget;
    setReactivating(true);
    try {
      await reminderTemplatesApi.activate(reminder.id);
      setReminders((prev) =>
        prev.map((r) => (r.id === reminder.id ? { ...r, status: "ACTIVE" } : r)),
      );
      setReactivateTarget(null);
      toast.success(`"${reminder.name}" reactivated`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reactivate reminder."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setReactivating(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel =
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";

    if (!isExcel) {
      toast.error("Please upload an Excel file (.xlsx or .xls).", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }

    // Nothing is attached yet — just parse client-side to populate the column
    // map dialog. The file only becomes "uploaded" once Confirm is pressed.
    setPendingFile(file);
    setIsUploading(true);
    setFileHeaders([]);
    setFileRows([]);

    parseFileRows(file)
      .then(({ headers, rows }) => {
        setFileHeaders(headers);
        setFileRows(rows);
        setIsUploading(false);
        setColumnMapOpen(true);
      })
      .catch(() => {
        setIsUploading(false);
        setPendingFile(null);
        toast.error("Failed to read the file. Please try again.", {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      });

    e.target.value = "";
  }

  function handleColumnMapConfirm(
    phoneCol: string,
    dateCol?: string,
    calendar?: DateCalendar,
  ) {
    setColumnMapOpen(false);
    if (!dateCol || !calendar || !pendingFile) {
      setPendingFile(null);
      return;
    }
    const confirmedFile = pendingFile;
    setUploadedFile(confirmedFile);
    setUploadedHeaders(fileHeaders);
    setPendingFile(null);

    const mapping = { phoneCol, dateCol, calendar };
    setColumnMapping(mapping);
    setProcessedFile(
      buildMappedFile(confirmedFile.name, fileRows, phoneCol, dateCol, calendar),
    );
    toast.success(`"${confirmedFile.name}" ready.`, {
      icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
    });

    setReminderMatchCounts(
      computeMatchCounts(reminders, fileRows, dateCol, phoneCol, calendar),
    );

    // Build first-row preview from the uploaded file
    if (fileRows.length > 0) {
      const first = fileRows[0];
      const preview: Record<string, string> = {};
      Object.entries(first).forEach(([k, v]) => {
        preview[`{{${k}}}`] = String(
          v instanceof Date ? v.toLocaleDateString() : (v ?? ""),
        );
      });
      setFirstRowData(preview);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (isUploading) return;
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const fakeEvent = {
      target: { files: [file], value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleFileChange(fakeEvent);
  }

  function removeFile() {
    setUploadedFile(null);
    setUploadedHeaders([]);
    setFileHeaders([]);
    setFileRows([]);
    setColumnMapping(null);
    setProcessedFile(null);
    setPendingFile(null);
    setReminderMatchCounts({});
    setFirstRowData({});
  }

  const [isSending, setIsSending] = React.useState(false);

  async function handleSendForApproval() {
    // Only ACTIVE, compatible, selected templates can be sent.
    const selected = reminders.filter(
      (r) => selectedIds.has(r.id) && r.status === "ACTIVE",
    );
    const missing: string[] = [];
    if (selected.length === 0) missing.push("select at least one reminder");
    if (!processedFile) missing.push("upload and map policy data");
    if (missing.length > 0) {
      toast.error(`To send, please ${missing.join(" and ")}.`, {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }
    const compatible = selected.filter(
      (r) => checkCompatibility(r.headers, uploadedHeaders).compatible,
    );
    if (compatible.length === 0) {
      toast.error(
        "No selected reminders are compatible with the uploaded file. Ensure your file contains all required columns.",
        { icon: <XCircle className="size-4" strokeWidth={2.5} />, duration: 7000 },
      );
      return;
    }

    setIsSending(true);
    try {
      // One upload of today's data, shared by every run in this batch.
      const upload = await groupsApi.standaloneUpload(processedFile!);
      const uploadId = upload.id;

      // Each Send creates a NEW run (a separate, approval-gated instance) from
      // the template — approval is required every time, independent of any
      // earlier run. Handled independently so one failure doesn't block the
      // rest of the batch.
      let created = 0;
      let failed = 0;
      const sentIds: string[] = [];
      for (const r of compatible) {
        try {
          await remindersApi.create({ reminderTemplateId: r.id, uploadId });
          created++;
          sentIds.push(r.id);
        } catch {
          failed++;
        }
      }

      // Clear the checkboxes for templates that were successfully sent.
      if (sentIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          sentIds.forEach((id) => next.delete(id));
          return next;
        });
      }

      if (created > 0) {
        toast.success(
          `${created} reminder${created !== 1 ? "s" : ""} submitted for approval` +
            (failed > 0 ? ` · ${failed} failed` : "") +
            ". They'll send once approved.",
          { icon: <CheckCircle2 className="size-4" strokeWidth={2.5} /> },
        );
      } else {
        toast.error("Failed to submit reminders for approval.", {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to send reminders."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setIsSending(false);
    }
  }

  const compatibilitySummary = React.useMemo(() => {
    if (!fileReady) return null;
    const sendable = reminders.filter((r) => r.status === "ACTIVE");
    const compatible = sendable.filter(
      (r) => checkCompatibility(r.headers, uploadedHeaders).compatible,
    ).length;
    return { compatible, total: sendable.length };
  }, [reminders, uploadedHeaders, fileReady]);

  const activeReminders = reminders.filter((r) => selectedIds.has(r.id));

  // Search + status filter + sort for the template list.
  const visibleReminders = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = reminders.filter((r) => {
      const matchSearch = !q || r.name.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
    if (sortField) {
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (sortField === "name") cmp = a.name.localeCompare(b.name);
        else cmp = a.triggerDays - b.triggerDays;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [reminders, search, statusFilter, sortField, sortDir]);

  function toggleSort(field: NonNullable<ReminderSortField>) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <TypographyH3>Send Reminder</TypographyH3>
          <TypographyMuted>
            Pick reminder templates, upload today's policy data, and send for
            approval — each send is approved separately before it goes out.
          </TypographyMuted>
        </div>
        <Button onClick={() => { setCreateKey((k) => k + 1); setCreateOpen(true); }} className="shrink-0" data-guide="reminder-new">
          <Plus />
          Create Reminder
        </Button>
      </div>
      <Separator className="mb-8" />

      {/* Main card */}
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] divide-y md:divide-y-0 md:divide-x">

          {/* Left: Reminder template list */}
          <div>
            {/* Search / filter / sort toolbar */}
            <div className="flex flex-wrap items-center gap-2 p-3 border-b" data-guide="reminder-toolbar">
              <div className="relative flex-1 min-w-40">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search reminders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => v && setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="h-9 w-32 text-xs">
                  <span className="flex-1 text-left">
                    {statusFilter === "all"
                      ? "All statuses"
                      : statusFilter === "ACTIVE"
                        ? "Active"
                        : "Inactive"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1 text-xs"
                onClick={() => toggleSort("name")}
              >
                <ArrowUpDown className="size-3.5" />
                Name{sortField === "name" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1 text-xs"
                onClick={() => toggleSort("triggerDays")}
              >
                <ArrowUpDown className="size-3.5" />
                Days{sortField === "triggerDays" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </Button>
            </div>

            <div className="divide-y">
            {remindersLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Loading reminders…
              </div>
            ) : reminders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No reminders yet. Click "Create Reminder" to add one.
              </div>
            ) : visibleReminders.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No reminders match your search or filter.
              </div>
            ) : null}
            {visibleReminders.map((reminder) => {
              const compat = checkCompatibility(reminder.headers, uploadedHeaders);
              const inactive = reminder.status !== "ACTIVE";
              const isDisabled = inactive || !fileReady || !compat.compatible;
              const selected = selectedIds.has(reminder.id);
              const stat = reminderMatchCounts[reminder.id];
              const previewNodes = resolvePreviewNodes(
                reminder.message,
                Object.keys(firstRowData).length
                  ? firstRowData
                  : sampleFromHeaders(reminder.headers),
              );

              return (
                <div
                  key={reminder.id}
                  className={cn("p-4 transition-opacity", isDisabled && !inactive && "opacity-60")}
                >
                  {/* Row: checkbox + name + badges + actions */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`rm-${reminder.id}`}
                      checked={selected}
                      disabled={isDisabled}
                      onCheckedChange={() => toggleSelected(reminder.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label
                          htmlFor={`rm-${reminder.id}`}
                          className={cn(
                            "text-sm font-semibold",
                            isDisabled ? "cursor-not-allowed" : "cursor-pointer",
                          )}
                        >
                          {reminder.name}
                        </Label>
                        {inactive ? (
                          <span className="text-[10px] font-semibold text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5">
                            Inactive
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-full px-2 py-0.5">
                            Active
                          </span>
                        )}
                        {!inactive && fileReady && (
                          compat.compatible ? (
                            <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5">
                              Compatible
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
                              <AlertTriangle className="size-3" />
                              Incompatible
                            </span>
                          )
                        )}
                      </div>
                      <TypographyMuted className="text-xs mt-0.5">
                        {reminder.triggerDays} days before expiry
                      </TypographyMuted>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {inactive ? (
                        <button
                          type="button"
                          onClick={() => setReactivateTarget(reminder)}
                          title="Reactivate"
                          className="text-muted-foreground hover:text-green-600 transition-colors"
                        >
                          <Power className="size-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeactivateTarget(reminder)}
                          title="Deactivate"
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditKey((k) => k + 1);
                          setEditTarget(reminder);
                        }}
                        title="Edit"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <SquarePen className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* Message preview */}
                  <div className="mt-3 rounded-md border bg-accent/30 px-3 py-2 space-y-1 text-sm">
                    <p className="text-xs font-medium text-muted-foreground">
                      FROM: NibInsure (8559)
                    </p>
                    <p className="leading-relaxed">{previewNodes}</p>
                  </div>

                  {/* Context-aware status bar — only for selected reminders */}
                  {selected && (
                    <div className="mt-3 space-y-2">
                      {!hasFile ? (
                        <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                          <Info className="size-3.5 shrink-0" />
                          Upload policy data on the right to see recipient count
                        </div>
                      ) : !compat.compatible ? (
                        <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="size-3.5 shrink-0" />
                          <span>
                            File is missing required columns:{" "}
                            <span className="font-semibold">
                              {compat.missing.join(", ")}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between rounded-md bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                            <span className="font-medium">Ready to Send</span>
                            <span className="text-xs opacity-70">
                              {stat
                                ? `${stat.count} valid recipient${stat.count === 1 ? "" : "s"} match`
                                : `rows expiring in exactly ${reminder.triggerDays} days`}
                            </span>
                          </div>
                          {stat && stat.invalidPhone > 0 && (
                            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="size-3.5 shrink-0" />
                              {stat.invalidPhone} matching row
                              {stat.invalidPhone === 1 ? "" : "s"} skipped — no phone number.
                            </div>
                          )}
                          {stat && stat.missingVars > 0 && (
                            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="size-3.5 shrink-0" />
                              {stat.missingVars} recipient
                              {stat.missingVars === 1 ? "" : "s"} missing one or more message
                              values (they'll render blank).
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>

          {/* Right: Upload Policy Data */}
          <div className="p-4 space-y-4" data-guide="reminder-upload">
            <div>
              <p className="font-semibold text-sm">Upload Policy Data</p>
              <TypographyMuted className="text-xs mt-1 leading-relaxed">
                Upload today's full policy list. The system scans the
                ExpiryDate column and sends SMS only to contacts expiring in
                exactly the reminder's configured days.{" "}
                <span className="font-medium text-foreground/70">
                  A fresh upload is required every time you send.
                </span>
              </TypographyMuted>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />

            {!uploadedFile ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onKeyDown={(e) =>
                  e.key === "Enter" && fileInputRef.current?.click()
                }
                className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-accent/20 px-4 py-8 text-center transition-colors hover:bg-accent/40"
              >
                <UploadCloud className="size-7 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {isUploading
                    ? "Reading file…"
                    : "Click to upload or drag & drop"}
                </p>
                <TypographyMuted className="text-xs">
                  {isUploading
                    ? "Nothing is uploaded yet — map columns next."
                    : "Excel files only (.xlsx, .xls)"}
                </TypographyMuted>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border bg-accent/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileSpreadsheet className="size-5 shrink-0 text-green-600" />
                    <span className="truncate text-sm font-medium">
                      {uploadedFile.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="space-y-1">
                  <Progress value={100} className="h-1.5" />
                  <TypographyMuted className="text-xs">
                    File ready to send
                  </TypographyMuted>
                </div>

                {columnMapping && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                    Phone: <span className="font-semibold">{columnMapping.phoneCol}</span>
                    {" · "}
                    Date: <span className="font-semibold">{columnMapping.dateCol}</span>
                    {" ("}
                    {columnMapping.calendar === "ethiopian" ? "Ethiopian" : "Gregorian"}
                    {")"}
                  </div>
                )}

                {/* Compatibility summary */}
                {compatibilitySummary && (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium",
                      compatibilitySummary.compatible ===
                        compatibilitySummary.total
                        ? "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {compatibilitySummary.compatible ===
                    compatibilitySummary.total ? (
                      <CheckCircle2 className="size-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="size-3.5 shrink-0" />
                    )}
                    {compatibilitySummary.compatible} of{" "}
                    {compatibilitySummary.total} reminders compatible with this
                    file
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Previews for active reminders */}
        <div
          className={cn(
            "grid transition-all duration-500 ease-in-out",
            activeReminders.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden">
            <Separator />
            <div className="p-4 space-y-6">
              {activeReminders.map((reminder) => {
                const previewNodes = resolvePreviewNodes(
                  reminder.message,
                  Object.keys(firstRowData).length
                    ? firstRowData
                    : sampleFromHeaders(reminder.headers),
                );
                return (
                  <div key={reminder.id} className="space-y-2">
                    <div>
                      <p className="font-semibold text-sm">
                        {reminder.name} Preview
                      </p>
                      <TypographyMuted className="text-xs">
                        {Object.keys(firstRowData).length
                          ? "Preview using row 1 from uploaded file"
                          : "Preview of message (Contacts view)"}
                      </TypographyMuted>
                    </div>
                    <div className="rounded-lg border bg-accent/20 p-4 space-y-2 min-h-16">
                      <TypographySmall className="font-medium text-muted-foreground">
                        FROM: NibInsure (8559)
                      </TypographySmall>
                      <p className="text-sm leading-relaxed">{previewNodes}</p>
                    </div>
                    <TypographyMuted className="text-xs">
                      Sample values · row 1
                    </TypographyMuted>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Send for Approval */}
        <div className="p-4 pt-8 flex justify-end">
          <Button size="lg" onClick={handleSendForApproval} disabled={isSending} data-guide="reminder-send">
            {isSending ? "Sending…" : "Send for Approval"}
          </Button>
        </div>
      </div>

      {/* Create Dialog */}
      <ReminderFormDialog
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        groups={groups}
        onSave={handleCreate}
      />

      {/* Edit Dialog */}
      <ReminderFormDialog
        key={editKey}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        mode="edit"
        initialReminder={editTarget ?? undefined}
        groups={groups}
        onSave={handleEdit}
      />

      {/* Deactivate Confirm Dialog */}
      <Dialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Reminder</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate &ldquo;
              {deactivateTarget?.name}&rdquo;? It won't be available to send
              until you reactivate it. Your existing sends aren't affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Confirm Dialog */}
      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => !open && setReactivateTarget(null)}
        title="Reactivate Reminder?"
        description={`"${reactivateTarget?.name ?? ""}" becomes available again to select and send.`}
        destructive={false}
        confirmLabel="Reactivate"
        acting={reactivating}
        actingLabel="Reactivating..."
        onConfirm={handleReactivate}
      />

      {/* Column Map Dialog for policy data upload */}
      <ColumnMapDialog
        open={columnMapOpen}
        headers={fileHeaders}
        fileName={pendingFile?.name ?? ""}
        requireDateCol
        onConfirm={handleColumnMapConfirm}
        onCancel={() => {
          setColumnMapOpen(false);
          setPendingFile(null);
          setFileHeaders([]);
          setFileRows([]);
        }}
      />
    </div>
  );
}
