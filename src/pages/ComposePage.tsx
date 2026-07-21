"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarIcon,
  CheckCircle2,
  FileSpreadsheet,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  TypographyH1,
  TypographyMuted,
  TypographySmall,
} from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { headersToVariables, sampleFromHeaders, sampleFromMember } from "@/lib/templates";
import {
  apiErrorMessage,
  campaignsApi,
  groupsApi,
  templatesApi,
  type ApiGroup,
  type ApiTemplate,
  type CreateCampaignBody,
} from "@/lib/services";
import { ColumnMapDialog } from "@/components/ui/column-map-dialog";

const DEFAULT_SAMPLE: Record<string, string> = {
  "{{Name}}": "Abebe Girma",
  "{{PolicyNo}}": "NIC-MTR-00421",
  "{{ExpiryDate}}": "April 30, 2026",
};

function resolvePreview(
  text: string,
  sample: Record<string, string>,
): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    sample[part] !== undefined ? <strong key={i}>{sample[part]}</strong> : part,
  );
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Case-insensitive lookup of a header's value in a row. */
function composeRowValue(row: Record<string, unknown>, header: string): unknown {
  if (header in row) return row[header];
  const lower = header.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k];
  }
  return undefined;
}

/** Parses an uploaded Excel file into object rows keyed by header. */
function parseObjectRows(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }));
      } catch {
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

export default function ComposePage() {
  const navigate = useNavigate();

  const [campaignName, setCampaignName] = React.useState("");
  const [useContactGroups, setUseContactGroups] = React.useState(false);
  const [contactGroup, setContactGroup] = React.useState("");
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isParsing, setIsParsing] = React.useState(false);
  const [excelHeaders, setExcelHeaders] = React.useState<string[]>([]);
  const [excelSample, setExcelSample] =
    React.useState<Record<string, string>>(DEFAULT_SAMPLE);
  const [excelRowCount, setExcelRowCount] = React.useState(0);
  // Full parsed rows of the uploaded file + the mapped phone column, used to
  // count actual valid recipients (non-empty phone) and warn about rows
  // missing message-variable values.
  const [uploadedRows, setUploadedRows] = React.useState<Record<string, unknown>[]>([]);
  const [uploadPhoneCol, setUploadPhoneCol] = React.useState<string>("");
  const [useTemplates, setUseTemplates] = React.useState(false);
  const [selectedTemplate, setSelectedTemplate] = React.useState("");
  const [scheduleMessage, setScheduleMessage] = React.useState(false);
  const [date, setDate] = React.useState<Date | undefined>(undefined);
  const todayStart = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [messageText, setMessageText] = React.useState("");

  // Real data
  const [templates, setTemplates] = React.useState<ApiTemplate[]>([]);
  const [groups, setGroups] = React.useState<ApiGroup[]>([]);
  const [loadingData, setLoadingData] = React.useState(true);
  const [uploadId, setUploadId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [columnMapState, setColumnMapState] = React.useState<{ file: File; headers: string[] } | null>(null);

  const [groupFirstMemberSample, setGroupFirstMemberSample] = React.useState<Record<string, string>>({});

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Fetch templates and groups on mount
  React.useEffect(() => {
    let cancelled = false;
    setLoadingData(true);
    Promise.all([
      templatesApi.list("APPROVED"),
      groupsApi.list(),
    ])
      .then(([tpls, grps]) => {
        if (cancelled) return;
        setTemplates(tpls);
        setGroups(grps);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(apiErrorMessage(err, "Failed to load templates or groups."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!useContactGroups || !contactGroup) {
      setGroupFirstMemberSample({});
      return;
    }
    const grp = groups.find((g) => g.id === contactGroup);
    const fields = grp?.fields ?? [];
    groupsApi.listMembers(contactGroup).then((members) => {
      if (members.length === 0) { setGroupFirstMemberSample({}); return; }
      setGroupFirstMemberSample(sampleFromMember(fields, members[0]));
    }).catch(() => {});
  }, [useContactGroups, contactGroup, groups]);

  const charCount = messageText.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  const selectedGroupObj = groups.find((g) => g.id === contactGroup);
  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  // Linked group for the selected template (for display)
  const templateLinkedGroup = selectedTemplateObj?.recipientGroupId
    ? groups.find((g) => g.id === selectedTemplateObj.recipientGroupId)
    : null;

  // Variables come from the chosen data source's columns
  const activeHeaders = useContactGroups
    ? (selectedGroupObj?.fields ?? [])
    : excelHeaders;
  const dynamicVariables = headersToVariables(activeHeaders);

  // Writing a custom message requires a data source so its variables are known
  const hasDataSource = useContactGroups ? !!contactGroup : !!uploadedFile;

  // Actual recipients from the uploaded file: distinct non-empty phone numbers,
  // plus how many matching rows have no phone and how many are missing values
  // for the columns the message references.
  const uploadStats = React.useMemo(() => {
    if (useTemplates || useContactGroups || uploadedRows.length === 0 || !uploadPhoneCol)
      return null;
    const vars = [...messageText.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1].trim());
    const seen = new Set<string>();
    let noPhone = 0;
    let missingVars = 0;
    for (const row of uploadedRows) {
      const phone = String(composeRowValue(row, uploadPhoneCol) ?? "").trim();
      if (!phone) {
        noPhone++;
        continue;
      }
      const norm = phone.replace(/\s/g, "");
      if (seen.has(norm)) continue;
      seen.add(norm);
      if (vars.some((v) => isBlank(composeRowValue(row, v)))) missingVars++;
    }
    return { valid: seen.size, noPhone, missingVars };
  }, [uploadedRows, uploadPhoneCol, messageText, useTemplates, useContactGroups]);

  // Recipient count + whether the preview has data to render the first row
  // from. For uploads, this is the number of distinct valid phone numbers —
  // not the raw row count — falling back to raw rows only while the file is
  // still parsing.
  const recipientCount = useContactGroups
    ? (selectedGroupObj?.memberCount ?? 0)
    : (uploadStats?.valid ?? excelRowCount);
  const hasPreviewData = useTemplates ? !!selectedTemplateObj : hasDataSource;

  const previewNodes = React.useMemo(() => {
    if (useTemplates) {
      return resolvePreview(
        selectedTemplateObj?.body ?? "",
        sampleFromHeaders(selectedTemplateObj?.variables ?? []),
      );
    }
    let sample: Record<string, string>;
    if (excelHeaders.length) {
      sample = excelSample;
    } else if (useContactGroups) {
      // Real values from the first group member override header placeholders.
      sample = {
        ...sampleFromHeaders(selectedGroupObj?.fields ?? []),
        ...groupFirstMemberSample,
      };
    } else {
      sample = {};
    }
    return resolvePreview(messageText, sample);
  }, [
    useTemplates,
    selectedTemplateObj,
    useContactGroups,
    selectedGroupObj,
    excelHeaders,
    excelSample,
    messageText,
    groupFirstMemberSample,
  ]);

  function insertVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) {
      setMessageText((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? messageText.length;
    const end = el.selectionEnd ?? messageText.length;
    const next =
      messageText.slice(0, start) + variable + messageText.slice(end);
    setMessageText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function parseExcelHeaders(file: File) {
    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
        if (rows.length > 0) {
          const headers = (rows[0] as unknown as string[])
            .map((h) => String(h).trim())
            .filter(Boolean);
          setExcelHeaders(headers);
          setExcelRowCount(Math.max(0, rows.length - 1));
          if (rows.length > 1) {
            const firstRow = rows[1] as unknown as string[];
            const sample: Record<string, string> = {};
            headers.forEach((h, i) => {
              sample[`{{${h}}}`] = String(firstRow[i] ?? "");
            });
            setExcelSample(sample);
          }
        }
      } catch {
        // silently ignore
      } finally {
        setIsParsing(false);
      }
    };
    reader.onerror = () => setIsParsing(false);
    reader.readAsArrayBuffer(file);
  }

  function parseHeadersOnly(file: File): Promise<string[]> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
          if (rows.length > 0) {
            const headers = (rows[0] as unknown as string[])
              .map((h) => String(h).trim())
              .filter(Boolean);
            resolve(headers);
          } else {
            resolve([]);
          }
        } catch {
          resolve([]);
        }
      };
      reader.onerror = () => resolve([]);
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const isExcel =
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls") ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel";

    if (!isExcel) {
      toast.error(
        "Invalid file type. Please upload an Excel file (.xlsx or .xls).",
        { icon: <XCircle className="size-4" strokeWidth={2.5} />, duration: 7000 },
      );
      return;
    }

    const headers = await parseHeadersOnly(file);
    setColumnMapState({ file, headers });
  }

  async function handleColumnMapConfirm(phoneCol: string) {
    if (!columnMapState) return;
    const { file } = columnMapState;
    setColumnMapState(null);

    setUploadedFile(file);
    setIsUploading(true);
    setUploadProgress(0);
    setUploadId(null);
    setExcelHeaders([]);
    setExcelSample(DEFAULT_SAMPLE);
    setExcelRowCount(0);
    setUploadPhoneCol(phoneCol);
    parseObjectRows(file).then(setUploadedRows).catch(() => setUploadedRows([]));

    parseExcelHeaders(file);

    let fakeProgress = 0;
    const interval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + Math.floor(Math.random() * 15) + 8, 90);
      setUploadProgress(fakeProgress);
    }, 180);

    try {
      const upload = await groupsApi.standaloneUpload(file);
      clearInterval(interval);
      setUploadProgress(100);
      setIsUploading(false);
      setUploadId(upload.id);
      if (upload.detectedCols && upload.detectedCols.length > 0) {
        setExcelHeaders(upload.detectedCols);
      }
      toast.success(`"${file.name}" uploaded successfully.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      clearInterval(interval);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadedFile(null);
      setUploadId(null);
      setExcelHeaders([]);
      setExcelSample(DEFAULT_SAMPLE);
      setExcelRowCount(0);
      toast.error(apiErrorMessage(err, "Failed to upload file. Please try again."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  function handleDropZoneClick() {
    if (!isUploading) fileInputRef.current?.click();
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
    setUploadProgress(0);
    setUploadId(null);
    setExcelHeaders([]);
    setExcelSample(DEFAULT_SAMPLE);
    setExcelRowCount(0);
    setUploadedRows([]);
    setUploadPhoneCol("");
  }

  async function handleSubmit() {
    const errors: string[] = [];

    if (!campaignName.trim()) errors.push("Campaign Name is required.");
    if (useTemplates) {
      if (!selectedTemplate) errors.push("Please select a message template.");
    } else {
      if (useContactGroups && !contactGroup)
        errors.push("Please select a contact group.");
      if (!useContactGroups && !uploadId)
        errors.push(
          isUploading
            ? "Please wait for the file upload to complete."
            : "Please upload a recipient Excel file.",
        );
      if (!messageText.trim()) errors.push("Message text cannot be empty.");
    }
    if (scheduleMessage && !date) errors.push("Please select a schedule date.");

    if (errors.length > 0) {
      errors.forEach((err) =>
        toast.error(err, {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        }),
      );
      return;
    }

    const body: CreateCampaignBody = {
      name: campaignName.trim(),
      kind: scheduleMessage ? "SCHEDULED" : "INSTANT",
    };

    if (scheduleMessage && date) {
      body.scheduledAt = date.toISOString();
    }

    if (useTemplates) {
      body.templateId = selectedTemplate;
      // Pass the template's linked group so the campaign inherits its recipients
      if (selectedTemplateObj?.recipientGroupId) {
        body.recipientGroupId = selectedTemplateObj.recipientGroupId;
      }
    } else {
      body.customBody = messageText.trim();
      if (useContactGroups) {
        body.recipientGroupId = contactGroup;
      } else if (uploadId) {
        body.uploadId = uploadId;
      }
    }

    setSubmitting(true);
    try {
      const created = await toast.promise(campaignsApi.create(body), {
        loading: scheduleMessage ? "Scheduling campaign…" : "Sending campaign…",
        success: "Campaign created!",
        error: (err) => apiErrorMessage(err, "Failed to create the campaign."),
        duration: 8000,
      }).unwrap();

      try {
        await campaignsApi.submit(created.id);
        toast.success("Campaign submitted for approval!", {
          icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        });
      } catch (err) {
        toast.warning(
          apiErrorMessage(
            err,
            "Campaign created, but couldn't be submitted for approval — submit it from Campaign Management.",
          ),
          { icon: <XCircle className="size-4" strokeWidth={2.5} />, duration: 7000 },
        );
      }
      navigate("/campaigns");
    } catch {
      // error toast already shown via toast.promise
    } finally {
      setSubmitting(false);
    }
  }

  const scheduleStep = useTemplates ? 2 : 4;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      {/* Page header */}
      <div className="mb-8 space-y-1">
        <TypographyH1 className="text-2xl font-bold">
          Compose Message
        </TypographyH1>
        <TypographyMuted>
          Send personalized bulk SMS to contact groups or an uploaded recipient
          list.
        </TypographyMuted>
      </div>
      <Separator className="mb-8" />
      {/* Main card */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-4 sm:p-6 space-y-6">
        {/* Campaign Name */}
        <div className="space-y-1.5" data-guide="compose-name">
          <Label htmlFor="campaign-name">
            Campaign Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="campaign-name"
            placeholder="e.g Policy Holders Jan2025"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />
        </div>

        <Separator />

        {/* Step 1 — Template */}
        <div className="space-y-4" data-guide="compose-recipients">
          <div>
            <p className="font-semibold text-base">Step 1 — Template</p>
            <TypographyMuted>
              Use a pre-built template with its own recipient list, or compose a
              custom message below.
            </TypographyMuted>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="use-templates"
              data-guide="compose-template-switch"
              checked={useTemplates}
              onCheckedChange={setUseTemplates}
            />
            <Label htmlFor="use-templates" className="cursor-pointer">
              Use template
            </Label>
          </div>

          {/* Template selector — animates in when useTemplates is true */}
          <Collapsible open={useTemplates}>
            <CollapsibleContent>
              <div className="space-y-3 pt-1">
                {loadingData ? (
                  <Skeleton className="h-9 w-full rounded-md" />
                ) : (
                  <SearchableSelect
                    items={templates.map((t) => ({ value: t.id, label: t.name }))}
                    value={selectedTemplate}
                    onValueChange={setSelectedTemplate}
                    placeholder="Select template"
                    searchPlaceholder="Search templates…"
                    emptyText="No approved templates found."
                  />
                )}

                {selectedTemplateObj && (
                  <div className="space-y-3 rounded-lg border bg-accent/20 p-4">
                    {/* Variables */}
                    <div className="space-y-1.5">
                      <TypographySmall className="font-semibold text-muted-foreground">
                        Template variables
                      </TypographySmall>
                      <div className="flex flex-wrap gap-1">
                        {selectedTemplateObj.variables.length > 0 ? (
                          selectedTemplateObj.variables.map((v) => (
                            <span
                              key={v}
                              className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                            >
                              {`{{${v}}}`}
                            </span>
                          ))
                        ) : (
                          <TypographyMuted>No variables.</TypographyMuted>
                        )}
                      </div>
                    </div>

                    {/* Recipient source */}
                    <div className="space-y-1">
                      <TypographySmall className="font-semibold text-muted-foreground">
                        Recipients
                      </TypographySmall>
                      {selectedTemplateObj.recipientGroupId ? (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                          <span>
                            Linked group:{" "}
                            <span className="font-medium">
                              {templateLinkedGroup?.name ?? selectedTemplateObj.recipientGroupId}
                            </span>
                            {templateLinkedGroup && (
                              <span className="text-muted-foreground ml-1">
                                ({templateLinkedGroup.memberCount.toLocaleString()} members)
                              </span>
                            )}
                          </span>
                        </div>
                      ) : selectedTemplateObj.recipientCount > 0 ? (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                          <span>
                            {selectedTemplateObj.recipientCount.toLocaleString()} inline recipients
                          </span>
                        </div>
                      ) : (
                        <TypographyMuted className="text-xs">
                          No recipients configured on this template.
                        </TypographyMuted>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Steps 2 & 3 — Recipients + Message (hidden when template is selected) */}
        <Collapsible open={!useTemplates}>
          <CollapsibleContent>
            <div className="space-y-6">
              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                {/* Step 2 — Recipients */}
                <div className="pb-6 md:pb-0 md:pr-8 space-y-4" data-guide="compose-source">
                  <div>
                    <p className="font-semibold text-base">Step 2 — Recipients</p>
                    <TypographyMuted>Choose who to send to.</TypographyMuted>
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch
                      id="use-contact-groups"
                      data-guide="compose-source-switch"
                      checked={useContactGroups}
                      onCheckedChange={setUseContactGroups}
                    />
                    <Label htmlFor="use-contact-groups" className="cursor-pointer">
                      Use contact groups
                    </Label>
                  </div>

                  {/* Contact groups — animates in when useContactGroups is true */}
                  <Collapsible open={useContactGroups}>
                    <CollapsibleContent>
                      <div className="pt-1">
                        {loadingData ? (
                          <Skeleton className="h-9 w-full rounded-md" />
                        ) : (
                          <SearchableSelect
                            items={groups.map((g) => ({ value: g.id, label: g.name }))}
                            value={contactGroup}
                            onValueChange={setContactGroup}
                            placeholder="Select contact group"
                            searchPlaceholder="Search contact groups…"
                            emptyText="No contact groups found."
                          />
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* File upload — animates in when useContactGroups is false */}
                  <Collapsible open={!useContactGroups}>
                    <CollapsibleContent>
                      <div className="space-y-2 pt-1">
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
                            onClick={handleDropZoneClick}
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleDropZoneClick()
                            }
                            className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-accent/30 px-4 py-6 text-center transition-colors hover:bg-accent/50"
                          >
                            <UploadCloud className="size-8 text-muted-foreground" />
                            <p className="text-sm font-medium">
                              Click to upload or drag &amp; drop
                            </p>
                            <TypographyMuted>
                              Excel files only (.xlsx, .xls)
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
                              {!isUploading && (
                                <button
                                  type="button"
                                  onClick={removeFile}
                                  className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground"
                                >
                                  <X className="size-4" />
                                </button>
                              )}
                            </div>

                            {(isUploading || uploadProgress > 0) && (
                              <div className="space-y-1">
                                <Progress value={uploadProgress} className="h-1.5" />
                                <TypographyMuted>
                                  {isUploading
                                    ? `Uploading… ${uploadProgress}%`
                                    : "Upload complete"}
                                </TypographyMuted>
                              </div>
                            )}

                            {/* Detected columns */}
                            <div className="pt-1 space-y-1.5">
                              <TypographySmall className="text-muted-foreground">
                                Detected columns:
                              </TypographySmall>
                              <div className="flex flex-wrap gap-1">
                                {isParsing ? (
                                  <>
                                    <Skeleton className="h-5 w-14 rounded" />
                                    <Skeleton className="h-5 w-20 rounded" />
                                    <Skeleton className="h-5 w-16 rounded" />
                                    <Skeleton className="h-5 w-12 rounded" />
                                  </>
                                ) : excelHeaders.length > 0 ? (
                                  excelHeaders.map((h) => (
                                    <span
                                      key={h}
                                      className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                                    >
                                      {h}
                                    </span>
                                  ))
                                ) : (
                                  <TypographyMuted>
                                    No columns detected.
                                  </TypographyMuted>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>

                {/* Step 3 — Message */}
                <div className="pt-6 md:pt-0 md:pl-8 space-y-4" data-guide="compose-message">
                  <div>
                    <p className="font-semibold text-base">Step 3 — Message</p>
                    <TypographyMuted>Write your message.</TypographyMuted>
                  </div>

                  <div className="space-y-4 pt-1">
                    <Label>
                      Message Text <span className="text-destructive">*</span>
                    </Label>
                    {hasDataSource ? (
                      <>
                        <Textarea
                          ref={textareaRef}
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          className="min-h-30 resize-none"
                        />
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <TypographyMuted className="my-2">
                            {charCount} / 160 chars · {smsCount} SMS
                          </TypographyMuted>
                          <div className="flex gap-1.5 flex-wrap">
                            {isParsing ? (
                              <>
                                <Skeleton className="h-7 w-20 rounded-md" />
                                <Skeleton className="h-7 w-24 rounded-md" />
                                <Skeleton className="h-7 w-20 rounded-md" />
                              </>
                            ) : (
                              dynamicVariables.map((v) => (
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
                              ))
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed bg-accent/20 px-4 py-6 text-center">
                        <TypographyMuted>
                          {useContactGroups
                            ? "Select a contact group to start writing — message variables come from its columns."
                            : "Upload an Excel file to start writing — message variables come from its columns."}
                        </TypographyMuted>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Schedule — step number adjusts based on whether template is used */}
        <div className="space-y-4" data-guide="compose-schedule">
          <div>
            <p className="font-semibold text-base">Step {scheduleStep} — Schedule</p>
            <TypographyMuted>Schedule campaign or send now</TypographyMuted>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="schedule-message"
              data-guide="compose-schedule-switch"
              checked={scheduleMessage}
              onCheckedChange={setScheduleMessage}
            />
            <Label htmlFor="schedule-message" className="cursor-pointer">
              Schedule Message
            </Label>
          </div>

          {/* Date picker — animates in when scheduleMessage is true */}
          <Collapsible open={scheduleMessage}>
            <CollapsibleContent>
              <div className="space-y-1.5 pt-1">
                <Label>
                  Select date <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full sm:w-56 justify-start text-left font-normal",
                      !date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "yyyy-MM-dd") : "Select date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      disabled={(d) => d < todayStart}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator />

        {/* Live Preview */}
        <div className="space-y-3" data-guide="compose-preview">
          <div>
            <p className="font-semibold text-base">Live Preview</p>
            <TypographyMuted>
              Preview of message (Contacts view)
            </TypographyMuted>
          </div>

          <div className="rounded-lg border bg-accent/20 p-4 space-y-1.5">
            <TypographySmall className="font-semibold text-muted-foreground uppercase tracking-wide">
              FROM: NibInsure (8559)
            </TypographySmall>
            {previewNodes.some((n) => n !== "") ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {previewNodes}
              </p>
            ) : (
              <TypographyMuted className="italic">
                {useTemplates
                  ? "Select a template to preview the message."
                  : "Start typing a message to see the preview."}
              </TypographyMuted>
            )}
          </div>

          <TypographyMuted>
            {hasPreviewData && !useTemplates
              ? `${recipientCount.toLocaleString()} recipient${recipientCount === 1 ? "" : "s"} · showing row 1`
              : hasPreviewData && useTemplates
                ? selectedTemplateObj?.recipientGroupId
                  ? `Recipients from linked group${templateLinkedGroup ? ` (${templateLinkedGroup.memberCount.toLocaleString()})` : ""}`
                  : selectedTemplateObj && selectedTemplateObj.recipientCount > 0
                    ? `${selectedTemplateObj.recipientCount.toLocaleString()} inline recipients`
                    : "No recipients configured on this template"
                : "No recipients yet — add a data source to preview."}
          </TypographyMuted>

          {/* Recipient data-quality warnings for uploaded files */}
          {uploadStats && uploadStats.noPhone > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {uploadStats.noPhone.toLocaleString()} row
              {uploadStats.noPhone === 1 ? "" : "s"} skipped — no phone number.
            </div>
          )}
          {uploadStats && uploadStats.missingVars > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {uploadStats.missingVars.toLocaleString()} recipient
              {uploadStats.missingVars === 1 ? "" : "s"} missing one or more
              message values (they&apos;ll render blank).
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            className="w-full sm:w-auto px-10"
            onClick={handleSubmit}
            disabled={submitting || isUploading}
            data-guide="compose-submit"
          >
            {submitting
              ? scheduleMessage
                ? "Scheduling…"
                : "Sending…"
              : scheduleMessage
                ? "Schedule for Approval"
                : "Send for Approval"}
          </Button>
        </div>
      </div>
      <ColumnMapDialog
        open={!!columnMapState}
        headers={columnMapState?.headers ?? []}
        fileName={columnMapState?.file.name ?? ""}
        requireDateCol={false}
        onConfirm={handleColumnMapConfirm}
        onCancel={() => setColumnMapState(null)}
      />
    </div>
  );
}
