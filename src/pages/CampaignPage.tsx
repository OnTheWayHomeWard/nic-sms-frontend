"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import {
  ArrowUpDown,
  CalendarIcon,
  Check,
  CheckCircle2,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FileSpreadsheet,
  LayoutTemplate,
  Pencil,
  Plus,
  PowerOff,
  RotateCcw,
  Search,
  Send,
  SquarePen,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/tablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  TypographyH3,
  TypographyMuted,
  TypographySmall,
} from "@/components/ui/typography";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  type ApiCampaign,
  type ApiDelegation,
  type ApiGroup,
  type ApiReminder,
  type ApiTemplate,
  type GroupMember,
  type UpdateCampaignBody,
  apiErrorMessage,
  campaignsApi,
  delegationsApi,
  groupsApi,
  remindersApi,
  templatesApi,
} from "@/lib/services";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { sampleFromHeaders, sampleFromMember } from "@/lib/templates";

// ─── Sort / direction types ─────────────────────────────────────────────────────

type CampaignSortField =
  | "name"
  | "kind"
  | "status"
  | "recipientCount"
  | "scheduledAt"
  | "creatorName";
type ActivitySortField =
  | "name"
  | "kind"
  | "totalMessages"
  | "deliveredMessages"
  | "failedMessages"
  | "deliveryRatePct";
type ApprovalSortField =
  | "name"
  | "kind"
  | "recipientCount"
  | "createdAt"
  | "status";
type SortDir = "asc" | "desc";

// ─── Constants ──────────────────────────────────────────────────────────────────

const APPROVAL_STATUSES = ["PENDING_APPROVAL", "PENDING_HEAD", "PENDING_CEO"];

const DEFAULT_VARIABLES = ["{{Name}}", "{{PolicyNo}}", "{{ExpiryDate}}"];

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className: "bg-muted text-muted-foreground",
  },
  PENDING_APPROVAL: {
    label: "Pending Approval",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  },
  PENDING_HEAD: {
    label: "Pending Head",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  },
  PENDING_CEO: {
    label: "Pending Delegate",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  },
  APPROVED: {
    label: "Approved",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
  QUEUED: {
    label: "Queued",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
  CANCELLED: {
    label: "Cancelled",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
  COMPLETED: {
    label: "Completed",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  },
  // Reminder-only status (campaigns never reach this one) — reuses the same
  // badge component as campaigns since the label set doesn't collide.
  FIRED: {
    label: "Sent",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
};

const KIND_DISPLAY: Record<string, { label: string; className: string }> = {
  INSTANT: {
    label: "Instant",
    className: "bg-secondary text-secondary-foreground",
  },
  SCHEDULED: {
    label: "Scheduled",
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  },
};

// ─── Utilities ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
}

/**
 * campaign.recipientCount is a stored column the backend only fills in at
 * dispatch time (see CampaignDispatchService) — it sits at its DB default of
 * 0 for every campaign that hasn't been sent yet (DRAFT, PENDING_*, APPROVED,
 * not-yet-due SCHEDULED). That made every undispatched campaign's row show
 * "0 recipients" in the table even though its group/template clearly has
 * members. Once dispatched, recipientCount is genuinely authoritative (it's
 * the real, deduped count of messages generated), so it still wins whenever
 * it's a positive number — this only fills the gap for the pre-send case,
 * the same way the preview dialog's own header already does.
 */
function campaignRecipientEstimate(
  c: ApiCampaign,
  groups: ApiGroup[],
  templates: ApiTemplate[],
): number | null {
  if (c.recipientCount != null && c.recipientCount > 0) return c.recipientCount;
  if (c.recipientGroupId) {
    const group = groups.find((g) => g.id === c.recipientGroupId);
    if (group) return group.memberCount;
  }
  if (c.templateId) {
    const tmpl = templates.find((t) => t.id === c.templateId);
    if (tmpl) {
      if (tmpl.recipientGroupId) {
        const group = groups.find((g) => g.id === tmpl.recipientGroupId);
        if (group) return group.memberCount;
      }
      return tmpl.recipientCount;
    }
  }
  // Upload-only campaign with no dispatch yet — there's no live source for
  // this (the backend exposes no way to look up a standalone upload's row
  // count after the fact), so the real number is genuinely unknown for now.
  return c.recipientCount;
}

/**
 * A fired reminder never becomes a campaign row — Message.reminderId links
 * its dispatched messages back to it directly instead (see
 * ReminderController.toDto's delivery-stat aggregation). Pre-fire, there are
 * no messages yet, so this estimates who WOULD be messaged the same way
 * campaignRecipientEstimate does for a campaign that hasn't dispatched yet.
 */
function reminderRecipientEstimate(
  r: ApiReminder,
  groups: ApiGroup[],
  templates: ApiTemplate[],
): number | null {
  if (r.recipientEstimate != null) return r.recipientEstimate;
  if (r.recipientGroupId) {
    const group = groups.find((g) => g.id === r.recipientGroupId);
    if (group) return group.memberCount;
  }
  if (r.templateId) {
    const tmpl = templates.find((t) => t.id === r.templateId);
    if (tmpl) {
      if (tmpl.recipientGroupId) {
        const group = groups.find((g) => g.id === tmpl.recipientGroupId);
        if (group) return group.memberCount;
      }
      return tmpl.recipientCount;
    }
  }
  return null;
}

// ─── Badge Helpers ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_DISPLAY[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("border-0 whitespace-nowrap", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const cfg = KIND_DISPLAY[kind] ?? {
    label: kind,
    className: "bg-secondary text-secondary-foreground",
  };
  return (
    <Badge variant="outline" className={cn("border-0", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

// ─── Message helpers ────────────────────────────────────────────────────────────

function resolveMessage(text: string): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    /^\{\{/.test(part) ? (
      <span key={i} className="text-primary font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function resolvePreviewFilled(
  text: string,
  sample: Record<string, string>,
): React.ReactNode[] {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) =>
    sample[part] !== undefined ? (
      <strong key={i}>{sample[part]}</strong>
    ) : /^\{\{/.test(part) ? (
      <span key={i} className="text-primary font-semibold">{part}</span>
    ) : (
      part
    ),
  );
}

/** Resolves what to actually show as a campaign/reminder's message: its own
 * custom body if set, otherwise the body of the template it references (so
 * template-based items never render as an unhelpful placeholder), flagged so
 * callers can show a "Template used" indicator alongside the preview. */
function messagePreviewFor(
  item: { customBody: string | null; templateId: string | null },
  templates: ApiTemplate[],
): { text: string; isTemplate: boolean; templateName?: string } {
  if (item.customBody) return { text: item.customBody, isTemplate: false };
  const tmpl = item.templateId ? templates.find((t) => t.id === item.templateId) : undefined;
  if (tmpl) return { text: tmpl.body, isTemplate: true, templateName: tmpl.name };
  return { text: "—", isTemplate: false };
}

function TemplateFlag({ name }: { name?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 rounded-full px-2 py-0.5 whitespace-nowrap">
      <LayoutTemplate className="size-3" />
      {name ? `Template: ${name}` : "Template used"}
    </span>
  );
}

type RecipientRow = { messageId?: string | null; phone: string; name?: string; status?: string | null; errorCode?: string | null };

/** Statuses the backend accepts for a manual re-send (MessageRetryService). */
const RETRYABLE_RECIPIENT_STATUSES = new Set(["FAILED", "EXPIRED"]);

const RECIPIENT_STATUS_STYLE: Record<string, string> = {
  DELIVERED: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800",
  SENT: "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
  FAILED: "text-destructive bg-destructive/10 border-destructive/30",
  PENDING: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
  QUEUED: "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
};

const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  DELIVERED: "Delivered",
  SENT: "Sent",
  FAILED: "Failed",
  PENDING: "Pending",
  QUEUED: "Queued",
};

/** Per-recipient delivery status chip. Renders nothing pre-dispatch (status
 * null), so recipient lists shown before sending stay clean. */
function RecipientStatusChip({ status }: { status?: string | null }) {
  if (!status) return null;
  const style = RECIPIENT_STATUS_STYLE[status] ?? "text-muted-foreground bg-muted border-border";
  return (
    <span className={cn("ml-auto shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 border", style)}>
      {RECIPIENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Sortable Header ────────────────────────────────────────────────────────────

function SortableHead<T extends string>({
  children,
  field,
  sortField,
  sortDir: _sortDir,
  onSort,
  className,
}: {
  children: React.ReactNode;
  field: T;
  sortField: T | null;
  sortDir: SortDir;
  onSort: (f: T) => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-left hover:text-foreground transition-colors"
      >
        {children}
        <ArrowUpDown
          className={cn(
            "size-3.5 shrink-0",
            sortField === field ? "text-foreground" : "text-muted-foreground",
          )}
        />
      </button>
    </TableHead>
  );
}

// ─── Pagination ─────────────────────────────────────────────────────────────────

function usePagination(total: number, initialRows = 10) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(initialRows);
  const [pageKey, setPageKey] = React.useState(0);

  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * rowsPerPage;

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage) return;
    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }

  function reset() {
    setCurrentPage(1);
  }

  const bar = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">{total} result(s)</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">
          Rows per page
        </span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(v) => {
            setRowsPerPage(Number(v));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground whitespace-nowrap mr-1">
          Page {safePage} of {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(1)}
          disabled={safePage === 1}
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(safePage - 1)}
          disabled={safePage === 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(safePage + 1)}
          disabled={safePage === totalPages}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => goToPage(totalPages)}
          disabled={safePage === totalPages}
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );

  return { safePage, pageStart, rowsPerPage, pageKey, goToPage, reset, bar };
}

// ─── Edit Campaign Dialog ───────────────────────────────────────────────────────

interface EditCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: ApiCampaign | null;
  onSave: (updated: ApiCampaign) => void;
}

function EditCampaignDialog({
  open,
  onOpenChange,
  campaign,
  onSave,
}: EditCampaignDialogProps) {
  const [name, setName] = React.useState("");
  const [useTemplate, setUseTemplate] = React.useState(false);
  const [templateId, setTemplateId] = React.useState("");
  const [useContactGroups, setUseContactGroups] = React.useState(true);
  const [contactGroupId, setContactGroupId] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [scheduleEnabled, setScheduleEnabled] = React.useState(false);
  const [scheduledDate, setScheduledDate] = React.useState<Date | undefined>(undefined);
  const todayStart = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [templates, setTemplates] = React.useState<ApiTemplate[]>([]);
  const [groups, setGroups] = React.useState<ApiGroup[]>([]);
  const [loadingData, setLoadingData] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [groupFirstMemberSample, setGroupFirstMemberSample] = React.useState<Record<string, string>>({});

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedGroup = groups.find((g) => g.id === contactGroupId);

  const dynamicVariables = React.useMemo(() => {
    if (useTemplate && selectedTemplate)
      return selectedTemplate.variables.map((v) => `{{${v}}}`);
    if (useContactGroups && selectedGroup)
      return selectedGroup.fields.map((f) => `{{${f}}}`);
    return DEFAULT_VARIABLES;
  }, [useTemplate, selectedTemplate, useContactGroups, selectedGroup]);

  const previewSample = React.useMemo(() => {
    if (useTemplate && selectedTemplate)
      return sampleFromHeaders(selectedTemplate.variables);
    if (useContactGroups && selectedGroup)
      return {
        ...sampleFromHeaders(selectedGroup.fields),
        ...groupFirstMemberSample,
      };
    return {};
  }, [useTemplate, selectedTemplate, useContactGroups, selectedGroup, groupFirstMemberSample]);

  React.useEffect(() => {
    if (!open || !campaign) return;

    setName(campaign.name);
    setUseTemplate(!!campaign.templateId);
    setTemplateId(campaign.templateId ?? "");
    const hasGroup = !!campaign.recipientGroupId;
    setUseContactGroups(hasGroup || !campaign.uploadId);
    setContactGroupId(campaign.recipientGroupId ?? "");
    setMessage(campaign.customBody ?? "");
    setScheduleEnabled(!!campaign.scheduledAt);
    setScheduledDate(
      campaign.scheduledAt ? new Date(campaign.scheduledAt) : undefined,
    );

    setLoadingData(true);
    Promise.all([templatesApi.list("APPROVED"), groupsApi.list()])
      .then(([tmpl, grps]) => {
        setTemplates(tmpl);
        setGroups(grps);
      })
      .catch((err) => {
        toast.error(apiErrorMessage(err, "Failed to load form data."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      })
      .finally(() => setLoadingData(false));
  }, [open, campaign]);

  React.useEffect(() => {
    if (!useContactGroups || !contactGroupId) {
      setGroupFirstMemberSample({});
      return;
    }
    const grp = groups.find((g) => g.id === contactGroupId);
    const fields = grp?.fields ?? [];
    groupsApi.listMembers(contactGroupId).then((members) => {
      if (members.length === 0) { setGroupFirstMemberSample({}); return; }
      setGroupFirstMemberSample(sampleFromMember(fields, members[0]));
    }).catch(() => {});
  }, [useContactGroups, contactGroupId, groups]);

  function insertVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) {
      setMessage((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + variable + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function handleTemplateSelect(id: string) {
    setTemplateId(id);
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) setMessage(tmpl.body);
  }

  async function handleSave() {
    const errors: string[] = [];
    if (!name.trim()) errors.push("Campaign name is required.");
    if (useTemplate && !templateId) errors.push("Please select a template.");
    if (!useTemplate && !message.trim()) errors.push("Message cannot be empty.");
    if (useContactGroups && !contactGroupId)
      errors.push("Please select a contact group.");

    if (errors.length > 0) {
      errors.forEach((err) =>
        toast.error(err, {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 6000,
        }),
      );
      return;
    }

    setSaving(true);
    try {
      const body: UpdateCampaignBody = {
        name: name.trim(),
        ...(useTemplate ? { templateId } : { customBody: message }),
        ...(useContactGroups ? { recipientGroupId: contactGroupId } : {}),
        ...(scheduleEnabled && scheduledDate
          ? { scheduledAt: scheduledDate.toISOString() }
          : {}),
      };
      const updated = await campaignsApi.update(campaign!.id, body);
      onSave(updated);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update campaign."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSaving(false);
    }
  }

  const hasUploadedFile = !!campaign?.uploadId && !campaign?.recipientGroupId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Edit Campaign
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="-mx-4 no-scrollbar max-h-[65vh] overflow-y-auto px-4">
          <div className="space-y-6">
            {/* Name + Kind (read-only) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="edit-name">
                  Campaign Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  placeholder="e.g. Motor Renewal — May 2025"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex h-9 items-center">
                  {campaign?.kind ? (
                    <KindBadge kind={campaign.kind} />
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Two-column: Recipients | Message */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* Left: Recipients */}
              <div className="pb-6 md:pb-0 md:pr-6 space-y-4">
                <div>
                  <p className="font-semibold my-2 text-sm">Recipients</p>
                  <TypographyMuted>
                    {hasUploadedFile
                      ? "Uploaded file recipients."
                      : "Select a contact group."}
                  </TypographyMuted>
                </div>

                {hasUploadedFile ? (
                  <div className="rounded-lg border bg-accent/20 p-4 space-y-1">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="size-5 shrink-0 text-green-600" />
                      <span className="text-sm font-medium">Uploaded file</span>
                    </div>
                    <TypographyMuted className="text-xs pl-7">
                      {campaign?.recipientCount?.toLocaleString() ?? "—"}{" "}
                      recipients
                    </TypographyMuted>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Switch
                        id="edit-contact-groups"
                        checked={useContactGroups}
                        onCheckedChange={setUseContactGroups}
                      />
                      <Label
                        htmlFor="edit-contact-groups"
                        className="cursor-pointer font-normal"
                      >
                        Use contact groups
                      </Label>
                    </div>

                    <Collapsible open={useContactGroups}>
                      <CollapsibleContent>
                        <div className="pt-1">
                          {loadingData ? (
                            <Skeleton className="h-9 w-full rounded-md" />
                          ) : (
                            <SearchableSelect
                              items={groups.map((g) => ({
                                value: g.id,
                                label: `${g.name} (${g.memberCount.toLocaleString()})`,
                                keywords: g.name,
                              }))}
                              value={contactGroupId}
                              onValueChange={setContactGroupId}
                              placeholder="Select contact group"
                              searchPlaceholder="Search contact groups…"
                              emptyText="No contact groups found."
                            />
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>

                    <Collapsible open={!useContactGroups}>
                      <CollapsibleContent>
                        <div className="pt-1">
                          <div className="flex min-h-28 cursor-not-allowed flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-accent/30 px-4 py-6 text-center opacity-50">
                            <UploadCloud className="size-7 text-muted-foreground" />
                            <p className="text-sm font-medium">
                              File upload unavailable in edit mode
                            </p>
                            <TypographyMuted>
                              Create a new campaign to upload recipients
                            </TypographyMuted>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
              </div>

              {/* Right: Message */}
              <div className="pt-6 md:pt-0 md:pl-6 space-y-4">
                <div>
                  <p className="font-semibold my-2 text-sm">Edit message</p>
                  <TypographyMuted>
                    Write or select a template message.
                  </TypographyMuted>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    id="edit-use-template"
                    checked={useTemplate}
                    onCheckedChange={(v) => {
                      setUseTemplate(v);
                      if (v && templateId) {
                        const tmpl = templates.find((t) => t.id === templateId);
                        if (tmpl) setMessage(tmpl.body);
                      }
                    }}
                  />
                  <Label
                    htmlFor="edit-use-template"
                    className="cursor-pointer font-normal"
                  >
                    Use template
                  </Label>
                </div>

                <Collapsible open={useTemplate}>
                  <CollapsibleContent>
                    <div className="pt-1">
                      {loadingData ? (
                        <Skeleton className="h-9 w-full rounded-md" />
                      ) : (
                        <SearchableSelect
                          items={templates.map((t) => ({ value: t.id, label: t.name }))}
                          value={templateId}
                          onValueChange={handleTemplateSelect}
                          placeholder="Select template"
                          searchPlaceholder="Search templates…"
                          emptyText="No templates found."
                        />
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={!useTemplate}>
                  <CollapsibleContent>
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="edit-message" className="font-normal">
                          Message Text{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <TypographyMuted className="text-xs">
                          {charCount}/160
                        </TypographyMuted>
                      </div>
                      <Textarea
                        id="edit-message"
                        ref={textareaRef}
                        placeholder="Dear {{Name}}, ..."
                        rows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        className="resize-none"
                      />
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <TypographyMuted className="text-xs">
                          {charCount} / 160 chars · {smsCount} SMS
                        </TypographyMuted>
                        <div className="flex gap-1.5 flex-wrap">
                          {dynamicVariables.map((v) => (
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
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>

            <Separator />

            {/* Schedule */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">Schedule</p>
                  <TypographyMuted>
                    {scheduleEnabled
                      ? "Send at a specific date and time."
                      : "Send immediately on approval."}
                  </TypographyMuted>
                </div>
                <Switch
                  checked={scheduleEnabled}
                  onCheckedChange={setScheduleEnabled}
                />
              </div>
              {scheduleEnabled && (
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "flex h-9 w-full items-center justify-start gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !scheduledDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="size-4" />
                    {scheduledDate
                      ? format(scheduledDate, "PPP")
                      : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledDate}
                      onSelect={setScheduledDate}
                      disabled={(date) => date < todayStart}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>

            <Separator />

            {/* Live Preview */}
            <div className="space-y-3">
              <div>
                <p className="font-semibold my-2 text-sm">Live Preview</p>
                <TypographyMuted>
                  Preview of message (Contacts view)
                </TypographyMuted>
              </div>
              <div className="rounded-lg border bg-accent/20 p-4 space-y-2.5">
                <TypographySmall className="font-semibold text-muted-foreground uppercase tracking-wide">
                  FROM: NibInsure (8559)
                </TypographySmall>
                {message.trim() ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {resolvePreviewFilled(message, previewSample)}
                  </p>
                ) : (
                  <TypographyMuted className="italic">
                    Start typing a message to see the preview.
                  </TypographyMuted>
                )}
              </div>
              {Object.keys(previewSample).length > 0 && (
                <TypographyMuted className="text-xs">
                  Sample values from selected {useTemplate ? "template" : "contact group"} columns
                </TypographyMuted>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loadingData}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Preview Dialog ────────────────────────────────────────────────────

function exportCampaignToExcel(
  campaign: ApiCampaign,
  groups: ApiGroup[] = [],
  templates: ApiTemplate[] = [],
) {
  const rows: Record<string, string | number>[] = [
    { Field: "Name", Value: campaign.name },
    { Field: "Type", Value: KIND_DISPLAY[campaign.kind]?.label ?? campaign.kind },
    { Field: "Status", Value: STATUS_DISPLAY[campaign.status]?.label ?? campaign.status },
    { Field: "Recipients", Value: campaignRecipientEstimate(campaign, groups, templates) ?? 0 },
    ...(campaign.scheduledAt
      ? [{ Field: "Scheduled Date", Value: formatDate(campaign.scheduledAt) }]
      : []),
    ...(campaign.creatorName
      ? [{ Field: "Created By", Value: campaign.creatorName }]
      : []),
    { Field: "Created At", Value: formatDate(campaign.createdAt) },
    ...(campaign.totalMessages > 0
      ? [
          { Field: "Total Sent", Value: campaign.totalMessages },
          { Field: "Delivered", Value: campaign.deliveredMessages },
          { Field: "Failed", Value: campaign.failedMessages },
          { Field: "Delivery Rate (%)", Value: campaign.deliveryRatePct },
        ]
      : []),
    ...(campaign.customBody
      ? [{ Field: "Message", Value: campaign.customBody }]
      : []),
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 22 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Campaign");
  XLSX.writeFile(wb, `${campaign.name.replace(/[/\\?%*:|"<>]/g, "-")}.xlsx`);
}

function LivePreviewDialog({
  open,
  onOpenChange,
  campaign,
  templates = [],
  groups = [],
  canRetry = false,
  canCancel = false,
  onCampaignUpdated,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: ApiCampaign | null;
  templates?: ApiTemplate[];
  groups?: ApiGroup[];
  canRetry?: boolean;
  canCancel?: boolean;
  onCampaignUpdated?: (updated: ApiCampaign) => void;
  onCancel?: (campaign: ApiCampaign) => void;
}) {
  const [recipientSearch, setRecipientSearch] = React.useState("");
  const [recipients, setRecipients] = React.useState<RecipientRow[]>([]);
  const [firstMember, setFirstMember] = React.useState<GroupMember | null>(null);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);
  // messageId being retried, or "all" during a retry-all — blocks double-clicks
  const [retrying, setRetrying] = React.useState<string | null>(null);
  // Failed recipient whose number is being corrected before a re-send.
  const [editNum, setEditNum] = React.useState<{ id: string; value: string } | null>(null);
  const [confirmRetryAll, setConfirmRetryAll] = React.useState(false);

  async function handleRetry(messageId?: string, newNumber?: string) {
    if (!campaign) return;
    setRetrying(messageId ?? "all");
    try {
      const res = await campaignsApi.retryFailed(campaign.id, messageId, newNumber);
      setRecipients((prev) =>
        prev.map((r) =>
          (messageId ? r.messageId === messageId : RETRYABLE_RECIPIENT_STATUSES.has(r.status ?? ""))
            ? { ...r, status: "PENDING", errorCode: null, phone: newNumber || r.phone }
            : r,
        ),
      );
      if (res.campaign) onCampaignUpdated?.(res.campaign);
      setEditNum(null);
      toast.success(
        `${res.retried} message${res.retried === 1 ? "" : "s"} re-queued for delivery.`,
        { icon: <CheckCircle2 className="size-4" strokeWidth={2.5} /> },
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't retry — the message wasn't re-queued."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setRetrying(null);
    }
  }

  // Once a campaign has actually dispatched, the recipient list read back is
  // who it was actually sent to; before that it's the live membership of
  // whichever source it's configured to send from — either way it now comes
  // from the one unified endpoint (see CampaignController.recipients).
  const dispatched = campaign
    ? campaign.status === "QUEUED" || campaign.status === "COMPLETED"
    : false;

  React.useEffect(() => {
    if (!open || !campaign) {
      setRecipients([]);
      setFirstMember(null);
      setRecipientSearch("");
      return;
    }

    let cancelled = false;

    // A first-recipient sample with rich fields (for {{Variable}} filling in
    // the message preview below) — separate from the recipient list itself,
    // since RecipientDto only carries phone/name.
    if (campaign.recipientGroupId) {
      groupsApi
        .listMembers(campaign.recipientGroupId)
        .then((members: GroupMember[]) => {
          if (!cancelled) setFirstMember(members[0] ?? null);
        })
        .catch(() => {});
    } else if (campaign.templateId) {
      const tmpl = templates.find((t) => t.id === campaign.templateId);
      const first = tmpl?.recipients?.[0];
      setFirstMember(first ? { phoneE164: first.phoneE164, name: first.name ?? undefined } : null);
    } else {
      setFirstMember(null);
    }

    setLoadingRecipients(true);
    campaignsApi
      .recipients(campaign.id)
      .then((data) => {
        if (!cancelled) setRecipients(data.map((r) => ({ messageId: r.messageId, phone: r.phone, name: r.name ?? undefined, status: r.status, errorCode: r.errorCode })));
      })
      .catch(() => !cancelled && setRecipients([]))
      .finally(() => !cancelled && setLoadingRecipients(false));

    return () => {
      cancelled = true;
    };
  }, [open, campaign, templates]);

  const preview = campaign
    ? messagePreviewFor(campaign, templates)
    : { text: "", isTemplate: false, templateName: undefined as string | undefined };

  // Build a sample from the first recipient, matching the variables in the body.
  const firstRecipientSample = React.useMemo(() => {
    if (!firstMember) return {};
    const vars = preview.text
      ? [...new Set((preview.text.match(/\{\{([^}]+)\}\}/g) ?? []).map((m: string) => m.slice(2, -2).trim()))]
      : [];
    return sampleFromMember(vars, firstMember);
  }, [firstMember, preview.text]);

  if (!campaign) return null;

  const recipientEstimate = campaignRecipientEstimate(campaign, groups, templates);

  const q = recipientSearch.toLowerCase().replace(/\s/g, "");
  const filteredRecipients = recipients
    .filter((r) => {
      if (!q) return true;
      const phoneNorm = (r.phone ?? "").replace(/\s/g, "").toLowerCase();
      const nameNorm = (r.name ?? "").toLowerCase();
      return phoneNorm.includes(q) || nameNorm.includes(q);
    })
    .slice(0, 50);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader guideId="campaign-preview">
          <DialogTitle>Campaign Preview</DialogTitle>
          <DialogDescription>{campaign.name}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Type
            </p>
            <KindBadge kind={campaign.kind} />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Status
            </p>
            <StatusBadge status={campaign.status} />
          </div>
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Recipients
            </p>
            <p className="font-medium">
              {recipientEstimate?.toLocaleString() ?? "—"}
            </p>
          </div>
          {campaign.scheduledAt && (
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Scheduled Date
              </p>
              <p className="font-medium">{formatDate(campaign.scheduledAt)}</p>
            </div>
          )}
          {campaign.creatorName && (
            <div className="col-span-2 space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Created By
              </p>
              <p className="font-medium">
                {campaign.creatorName}{" "}
                <span className="text-muted-foreground font-normal">
                  · {formatDate(campaign.createdAt)}
                </span>
              </p>
            </div>
          )}
          {campaign.totalMessages > 0 && (
            <>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Delivered
                </p>
                <p className="font-medium text-green-600 dark:text-green-400">
                  {campaign.deliveredMessages.toLocaleString()}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Failed
                </p>
                <p className="font-medium text-destructive">
                  {campaign.failedMessages.toLocaleString()}
                </p>
              </div>
              <div className="col-span-2 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Delivery Rate
                </p>
                <div className="flex items-center gap-2">
                  <Progress
                    value={campaign.deliveryRatePct}
                    className="h-1.5 flex-1"
                  />
                  <span className="text-xs tabular-nums">
                    {campaign.deliveryRatePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message Preview
            </p>
            {preview.isTemplate && <TemplateFlag name={preview.templateName} />}
          </div>
          <div className="rounded-lg border bg-accent/20 px-4 py-3 text-sm leading-relaxed">
            {preview.text !== "—"
              ? (Object.keys(firstRecipientSample).length > 0
                  ? resolvePreviewFilled(preview.text, firstRecipientSample)
                  : resolveMessage(preview.text))
              : <span className="text-muted-foreground italic">—</span>}
          </div>
          {preview.text !== "—" && (
            <TypographyMuted className="text-xs">
              {preview.text.length} chars &middot;{" "}
              {Math.ceil(preview.text.length / 160)} SMS part
              {Math.ceil(preview.text.length / 160) !== 1 ? "s" : ""}
              {Object.keys(firstRecipientSample).length > 0 && " · preview uses recipient 1"}
            </TypographyMuted>
          )}
        </div>

        <Separator />

        <div className="space-y-2" data-guide="preview-recipients">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recipients ({recipients.length > 0 ? recipients.length.toLocaleString() : recipientEstimate?.toLocaleString() ?? "—"})
            {dispatched && (
              <span className="ml-2 normal-case font-normal text-green-700 dark:text-green-400">
                &middot; actual
              </span>
            )}
          </p>
          {loadingRecipients ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <TypographyMuted className="text-sm italic">No recipient details available.</TypographyMuted>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by phone or name..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-48 rounded-md border">
                <div className="p-2 space-y-1">
                  {filteredRecipients.length === 0 ? (
                    <TypographyMuted className="text-xs py-4 text-center block">
                      No recipients match &quot;{recipientSearch}&quot;
                    </TypographyMuted>
                  ) : (
                    filteredRecipients.map((r, i) => {
                      const failed = RETRYABLE_RECIPIENT_STATUSES.has(r.status ?? "");
                      const editing = !!r.messageId && editNum?.id === r.messageId;
                      return (
                      <div
                        key={i}
                        className="rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground w-36 shrink-0">
                            {r.phone || "—"}
                          </span>
                          {r.name && (
                            <span className="truncate text-foreground">{r.name}</span>
                          )}
                          <RecipientStatusChip status={r.status} />
                          {canRetry && r.messageId && failed && (
                            <div className="ml-auto flex items-center gap-0.5 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                title="Fix number & resend"
                                disabled={retrying !== null}
                                onClick={() => setEditNum(editing ? null : { id: r.messageId!, value: r.phone })}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                title="Retry this recipient"
                                disabled={retrying !== null}
                                onClick={() => r.messageId && handleRetry(r.messageId)}
                              >
                                <RotateCcw className={cn("size-3.5", retrying === r.messageId && "animate-spin")} />
                              </Button>
                            </div>
                          )}
                        </div>
                        {failed && r.errorCode && !editing && (
                          <p className="text-[11px] text-destructive/80 pl-1 mt-0.5">
                            Reason: {r.errorCode}
                          </p>
                        )}
                        {editing && editNum && (
                          <div className="flex items-center gap-1.5 mt-1 pl-1">
                            <Input
                              value={editNum.value}
                              onChange={(e) => setEditNum({ id: r.messageId!, value: e.target.value })}
                              placeholder="Corrected number e.g. 0913..."
                              className="h-7 text-xs font-mono"
                            />
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={retrying !== null || !editNum.value.trim()}
                              onClick={() => handleRetry(r.messageId!, editNum.value.trim())}
                            >
                              Resend
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditNum(null)}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                      );
                    })
                  )}
                  {recipients.length > 50 && filteredRecipients.length === 50 && !q && (
                    <TypographyMuted className="text-xs text-center py-1 block">
                      Showing first 50 of {recipients.length.toLocaleString()} — search to narrow
                    </TypographyMuted>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          {canCancel && (campaign.status === "APPROVED" || campaign.status === "QUEUED") && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              onClick={() => onCancel?.(campaign)}
              data-guide="preview-cancel"
            >
              <PowerOff className="size-4" />
              {campaign.status === "QUEUED" ? "Cancel While Sending" : "Cancel Campaign"}
            </Button>
          )}
          {canRetry && campaign.failedMessages > 0 && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              disabled={retrying !== null}
              onClick={() => setConfirmRetryAll(true)}
              data-guide="preview-retry-all"
            >
              <RotateCcw className={cn("size-4", retrying === "all" && "animate-spin")} />
              Retry {campaign.failedMessages.toLocaleString()} Failed
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => exportCampaignToExcel(campaign, groups, templates)}
            data-guide="preview-export"
          >
            <FileDown className="size-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={confirmRetryAll}
      onOpenChange={setConfirmRetryAll}
      title="Retry Failed Messages?"
      description={`Re-send ${campaign.failedMessages.toLocaleString()} failed message${campaign.failedMessages === 1 ? "" : "s"} in "${campaign.name}"? Each one is re-queued and re-attempted with the carrier — no new approval is needed.`}
      confirmLabel="Retry All"
      acting={retrying === "all"}
      actingLabel="Retrying..."
      onConfirm={() => {
        setConfirmRetryAll(false);
        handleRetry();
      }}
    />
    </>
  );
}

// ─── Reminder Recipients Dialog ─────────────────────────────────────────────────

function ReminderRecipientsDialog({
  open,
  onOpenChange,
  reminder,
  templates = [],
  canRetry = false,
  onReminderUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: ApiReminder | null;
  templates?: ApiTemplate[];
  canRetry?: boolean;
  onReminderUpdated?: (updated: ApiReminder) => void;
}) {
  const [recipientSearch, setRecipientSearch] = React.useState("");
  const [recipients, setRecipients] = React.useState<RecipientRow[]>([]);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);
  // messageId being retried, or "all" during a retry-all — blocks double-clicks
  const [retrying, setRetrying] = React.useState<string | null>(null);
  // Failed recipient whose number is being corrected before a re-send.
  const [editNum, setEditNum] = React.useState<{ id: string; value: string } | null>(null);
  const [confirmRetryAll, setConfirmRetryAll] = React.useState(false);

  async function handleRetry(messageId?: string, newNumber?: string) {
    if (!reminder) return;
    setRetrying(messageId ?? "all");
    try {
      const res = await remindersApi.retryFailed(reminder.id, messageId, newNumber);
      setRecipients((prev) =>
        prev.map((r) =>
          (messageId ? r.messageId === messageId : RETRYABLE_RECIPIENT_STATUSES.has(r.status ?? ""))
            ? { ...r, status: "PENDING", errorCode: null, phone: newNumber || r.phone }
            : r,
        ),
      );
      if (res.reminder) onReminderUpdated?.(res.reminder);
      setEditNum(null);
      toast.success(
        `${res.retried} message${res.retried === 1 ? "" : "s"} re-queued for delivery.`,
        { icon: <CheckCircle2 className="size-4" strokeWidth={2.5} /> },
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't retry — the message wasn't re-queued."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setRetrying(null);
    }
  }

  // /reminders/{id}/recipients now resolves the right source itself (actual
  // messages once fired, otherwise the live group/upload/template it's
  // configured to send from), so recipients are always visible here —
  // pre-approval, pre-fire, or after a rejection.
  const fired = reminder?.status === "FIRED";

  React.useEffect(() => {
    if (!open || !reminder) {
      setRecipients([]);
      setRecipientSearch("");
      return;
    }
    let cancelled = false;
    setLoadingRecipients(true);
    remindersApi
      .recipients(reminder.id)
      .then((data) => {
        if (!cancelled) setRecipients(data.map((r) => ({ messageId: r.messageId, phone: r.phone, name: r.name ?? undefined, status: r.status, errorCode: r.errorCode })));
      })
      .catch(() => !cancelled && setRecipients([]))
      .finally(() => !cancelled && setLoadingRecipients(false));
    return () => {
      cancelled = true;
    };
  }, [open, reminder]);

  if (!reminder) return null;

  const preview = messagePreviewFor(reminder, templates);

  const q = recipientSearch.toLowerCase().replace(/\s/g, "");
  const filteredRecipients = recipients
    .filter((r) => {
      if (!q) return true;
      const phoneNorm = (r.phone ?? "").replace(/\s/g, "").toLowerCase();
      const nameNorm = (r.name ?? "").toLowerCase();
      return phoneNorm.includes(q) || nameNorm.includes(q);
    })
    .slice(0, 50);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{reminder.name}</DialogTitle>
          <DialogDescription>
            Fires every {reminder.triggerDays} day{reminder.triggerDays === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message Preview
            </p>
            {preview.isTemplate && <TemplateFlag name={preview.templateName} />}
          </div>
          <div className="rounded-lg border bg-accent/20 px-4 py-3 text-sm leading-relaxed">
            {preview.text !== "—"
              ? resolveMessage(preview.text)
              : <span className="text-muted-foreground italic">—</span>}
          </div>
        </div>

        {reminder.totalMessages > 0 && (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Delivered
                </p>
                <p className="font-medium text-green-600 dark:text-green-400">
                  {reminder.deliveredMessages.toLocaleString()}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Failed
                </p>
                <p className="font-medium text-destructive">
                  {reminder.failedMessages.toLocaleString()}
                </p>
              </div>
              <div className="col-span-2 space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Delivery Rate
                </p>
                <div className="flex items-center gap-2">
                  <Progress
                    value={reminder.deliveryRatePct}
                    className="h-1.5 flex-1"
                  />
                  <span className="text-xs tabular-nums">
                    {reminder.deliveryRatePct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
            <Separator />
          </>
        )}

        <div className="space-y-2">
          {loadingRecipients ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <TypographyMuted className="text-sm italic">
              {fired ? "No messages were sent." : "No recipient details available."}
            </TypographyMuted>
          ) : (
            <>
              {fired && (
                <p className="text-xs text-green-700 dark:text-green-400">
                  Actual recipients this reminder messaged
                </p>
              )}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by phone or name..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-72 rounded-md border">
                <div className="p-2 space-y-1">
                  {filteredRecipients.length === 0 ? (
                    <TypographyMuted className="text-xs py-4 text-center block">
                      No recipients match &quot;{recipientSearch}&quot;
                    </TypographyMuted>
                  ) : (
                    filteredRecipients.map((r, i) => {
                      const failed = RETRYABLE_RECIPIENT_STATUSES.has(r.status ?? "");
                      const editing = !!r.messageId && editNum?.id === r.messageId;
                      return (
                      <div
                        key={i}
                        className="rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground w-36 shrink-0">
                            {r.phone || "—"}
                          </span>
                          {r.name && (
                            <span className="truncate text-foreground">{r.name}</span>
                          )}
                          <RecipientStatusChip status={r.status} />
                          {canRetry && r.messageId && failed && (
                            <div className="ml-auto flex items-center gap-0.5 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                title="Fix number & resend"
                                disabled={retrying !== null}
                                onClick={() => setEditNum(editing ? null : { id: r.messageId!, value: r.phone })}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                title="Retry this recipient"
                                disabled={retrying !== null}
                                onClick={() => r.messageId && handleRetry(r.messageId)}
                              >
                                <RotateCcw className={cn("size-3.5", retrying === r.messageId && "animate-spin")} />
                              </Button>
                            </div>
                          )}
                        </div>
                        {failed && r.errorCode && !editing && (
                          <p className="text-[11px] text-destructive/80 pl-1 mt-0.5">
                            Reason: {r.errorCode}
                          </p>
                        )}
                        {editing && editNum && (
                          <div className="flex items-center gap-1.5 mt-1 pl-1">
                            <Input
                              value={editNum.value}
                              onChange={(e) => setEditNum({ id: r.messageId!, value: e.target.value })}
                              placeholder="Corrected number e.g. 0913..."
                              className="h-7 text-xs font-mono"
                            />
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={retrying !== null || !editNum.value.trim()}
                              onClick={() => handleRetry(r.messageId!, editNum.value.trim())}
                            >
                              Resend
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditNum(null)}>
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                      );
                    })
                  )}
                  {recipients.length > 50 && filteredRecipients.length === 50 && !q && (
                    <TypographyMuted className="text-xs text-center py-1 block">
                      Showing first 50 of {recipients.length.toLocaleString()} — search to narrow
                    </TypographyMuted>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <DialogFooter>
          {canRetry && reminder.failedMessages > 0 && (
            <Button
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
              disabled={retrying !== null}
              onClick={() => setConfirmRetryAll(true)}
            >
              <RotateCcw className={cn("size-4", retrying === "all" && "animate-spin")} />
              Retry {reminder.failedMessages.toLocaleString()} Failed
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={confirmRetryAll}
      onOpenChange={setConfirmRetryAll}
      title="Retry Failed Messages?"
      description={`Re-send ${reminder.failedMessages.toLocaleString()} failed message${reminder.failedMessages === 1 ? "" : "s"} for "${reminder.name}"? Each one is re-queued and re-attempted with the carrier — no new approval is needed.`}
      confirmLabel="Retry All"
      acting={retrying === "all"}
      actingLabel="Retrying..."
      onConfirm={() => {
        setConfirmRetryAll(false);
        handleRetry();
      }}
    />
    </>
  );
}

// ─── Approve/Reject Dialog ──────────────────────────────────────────────────────

function ApproveRejectDialog({
  open,
  onOpenChange,
  campaign,
  mode,
  onConfirm,
  acting,
  templates = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: ApiCampaign | null;
  mode: "approve" | "reject";
  onConfirm: (reason?: string) => void;
  acting?: boolean;
  templates?: ApiTemplate[];
}) {
  const [reason, setReason] = React.useState("");
  const [recipients, setRecipients] = React.useState<RecipientRow[]>([]);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);
  const [recipientSearch, setRecipientSearch] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  React.useEffect(() => {
    if (!open || !campaign) {
      setRecipients([]);
      setRecipientSearch("");
      return;
    }
    let cancelled = false;
    setLoadingRecipients(true);
    campaignsApi
      .recipients(campaign.id)
      .then((data) => {
        if (!cancelled) setRecipients(data.map((r) => ({ messageId: r.messageId, phone: r.phone, name: r.name ?? undefined, status: r.status, errorCode: r.errorCode })));
      })
      .catch(() => !cancelled && setRecipients([]))
      .finally(() => !cancelled && setLoadingRecipients(false));
    return () => {
      cancelled = true;
    };
  }, [open, campaign]);

  if (!campaign) return null;

  const preview = messagePreviewFor(campaign, templates);

  const q = recipientSearch.toLowerCase().replace(/\s/g, "");
  const filteredRecipients = recipients
    .filter((r) => {
      if (!q) return true;
      const phoneNorm = (r.phone ?? "").replace(/\s/g, "").toLowerCase();
      const nameNorm = (r.name ?? "").toLowerCase();
      return phoneNorm.includes(q) || nameNorm.includes(q);
    })
    .slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader guideId="campaign-approve">
          <DialogTitle>
            {mode === "approve" ? "Approve Campaign" : "Reject Campaign"}
          </DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? `Approve "${campaign.name}" to proceed with sending.`
              : `Reject "${campaign.name}" and return it to draft.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-accent/20 p-3 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Message
            </p>
            {preview.isTemplate && <TemplateFlag name={preview.templateName} />}
          </div>
          <p className="leading-relaxed text-xs">{preview.text}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Recipients ({recipients.length.toLocaleString()})
          </p>
          {loadingRecipients ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <TypographyMuted className="text-xs italic">
              No recipient details available.
            </TypographyMuted>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by phone or name..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-40 rounded-md border">
                <div className="p-2 space-y-1">
                  {filteredRecipients.length === 0 ? (
                    <TypographyMuted className="text-xs py-4 text-center block">
                      No recipients match &quot;{recipientSearch}&quot;
                    </TypographyMuted>
                  ) : (
                    filteredRecipients.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">
                          {r.phone || "—"}
                        </span>
                        {r.name && (
                          <span className="truncate text-foreground">{r.name}</span>
                        )}
                        <RecipientStatusChip status={r.status} />
                      </div>
                    ))
                  )}
                  {recipients.length > 50 && filteredRecipients.length === 50 && !q && (
                    <TypographyMuted className="text-xs text-center py-1 block">
                      Showing first 50 of {recipients.length.toLocaleString()} — search to narrow
                    </TypographyMuted>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {mode === "reject" && (
          <div className="space-y-2" data-guide="approve-reason">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              placeholder="Explain why this campaign is being rejected..."
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
          </div>
        )}

        <DialogFooter data-guide="approve-actions">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={acting}
          >
            Cancel
          </Button>
          <Button
            variant={mode === "approve" ? "default" : "destructive"}
            onClick={() => onConfirm(mode === "reject" ? reason : undefined)}
            disabled={acting}
          >
            {mode === "approve" ? (
              <>
                <Check className="size-4" />
                {acting ? "Approving..." : "Approve"}
              </>
            ) : (
              <>
                <XCircle className="size-4" />
                {acting ? "Rejecting..." : "Reject"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReminderApprovalDialog({
  open,
  onOpenChange,
  reminder,
  mode,
  onConfirm,
  acting,
  templates = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: ApiReminder | null;
  mode: "approve" | "reject";
  onConfirm: (reason?: string) => void;
  acting?: boolean;
  templates?: ApiTemplate[];
}) {
  const [reason, setReason] = React.useState("");
  const [recipients, setRecipients] = React.useState<RecipientRow[]>([]);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);
  const [recipientSearch, setRecipientSearch] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  React.useEffect(() => {
    if (!open || !reminder) {
      setRecipients([]);
      setRecipientSearch("");
      return;
    }
    let cancelled = false;
    setLoadingRecipients(true);
    remindersApi
      .recipients(reminder.id)
      .then((data) => {
        if (!cancelled) setRecipients(data.map((r) => ({ messageId: r.messageId, phone: r.phone, name: r.name ?? undefined, status: r.status, errorCode: r.errorCode })));
      })
      .catch(() => !cancelled && setRecipients([]))
      .finally(() => !cancelled && setLoadingRecipients(false));
    return () => {
      cancelled = true;
    };
  }, [open, reminder]);

  if (!reminder) return null;

  const preview = messagePreviewFor(reminder, templates);

  const q = recipientSearch.toLowerCase().replace(/\s/g, "");
  const filteredRecipients = recipients
    .filter((r) => {
      if (!q) return true;
      const phoneNorm = (r.phone ?? "").replace(/\s/g, "").toLowerCase();
      const nameNorm = (r.name ?? "").toLowerCase();
      return phoneNorm.includes(q) || nameNorm.includes(q);
    })
    .slice(0, 50);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "approve" ? "Approve Reminder" : "Reject Reminder"}
          </DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? `Approve "${reminder.name}" so it becomes eligible to fire.`
              : `Reject "${reminder.name}" and cancel it.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-accent/20 p-3 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Message
            </p>
            {preview.isTemplate && <TemplateFlag name={preview.templateName} />}
          </div>
          <p className="leading-relaxed text-xs">{preview.text}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Recipients ({recipients.length.toLocaleString()})
          </p>
          {loadingRecipients ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full rounded" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <TypographyMuted className="text-xs italic">
              No recipient details available.
            </TypographyMuted>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search by phone or name..."
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <ScrollArea className="h-40 rounded-md border">
                <div className="p-2 space-y-1">
                  {filteredRecipients.length === 0 ? (
                    <TypographyMuted className="text-xs py-4 text-center block">
                      No recipients match &quot;{recipientSearch}&quot;
                    </TypographyMuted>
                  ) : (
                    filteredRecipients.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">
                          {r.phone || "—"}
                        </span>
                        {r.name && (
                          <span className="truncate text-foreground">{r.name}</span>
                        )}
                        <RecipientStatusChip status={r.status} />
                      </div>
                    ))
                  )}
                  {recipients.length > 50 && filteredRecipients.length === 50 && !q && (
                    <TypographyMuted className="text-xs text-center py-1 block">
                      Showing first 50 of {recipients.length.toLocaleString()} — search to narrow
                    </TypographyMuted>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {mode === "reject" && (
          <div className="space-y-2">
            <Label htmlFor="reminder-reject-reason">Reason for rejection</Label>
            <Textarea
              id="reminder-reject-reason"
              placeholder="Explain why this reminder is being rejected..."
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={acting}
          >
            Cancel
          </Button>
          <Button
            variant={mode === "approve" ? "default" : "destructive"}
            onClick={() => onConfirm(mode === "reject" ? reason : undefined)}
            disabled={acting}
          >
            {mode === "approve" ? (
              <>
                <Check className="size-4" />
                {acting ? "Approving..." : "Approve"}
              </>
            ) : (
              <>
                <XCircle className="size-4" />
                {acting ? "Rejecting..." : "Reject"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Management Page ───────────────────────────────────────────────────

export default function CampaignPage() {
  const navigate = useNavigate();
  const { user, rolePermissions } = useAuth();

  // ── Data ──
  const [campaigns, setCampaigns] = React.useState<ApiCampaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [myDelegations, setMyDelegations] = React.useState<ApiDelegation[]>([]);
  const [pageTemplates, setPageTemplates] = React.useState<ApiTemplate[]>([]);
  const [pageGroups, setPageGroups] = React.useState<ApiGroup[]>([]);
  const [sentReminders, setSentReminders] = React.useState<ApiReminder[]>([]);
  const [remindersLoading, setRemindersLoading] = React.useState(true);
  const [pendingReminders, setPendingReminders] = React.useState<ApiReminder[]>([]);
  const [pendingRemindersLoading, setPendingRemindersLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    campaignsApi
      .list()
      .then((data) => {
        if (!cancelled) setCampaigns(data);
      })
      .catch((err) => {
        if (!cancelled)
          toast.error(apiErrorMessage(err, "Failed to load campaigns."), {
            icon: <XCircle className="size-4" strokeWidth={2.5} />,
            duration: 7000,
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    delegationsApi
      .mine(true)
      .then(setMyDelegations)
      .catch(() => {});
    templatesApi
      .list("APPROVED")
      .then(setPageTemplates)
      .catch(() => {});
    groupsApi
      .list()
      .then(setPageGroups)
      .catch(() => {});
  }, []);

  // CEOs see the delegate-approval queue themselves (they're the ultimate
  // approver for PENDING_CEO campaigns), in addition to anyone they've
  // explicitly delegated that authority to.
  const isDelegate = myDelegations.length > 0 || user?.role === "CEO";
  // A department head has no authority over PENDING_CEO campaigns — that
  // tier can only be acted on from the Delegate Approval tab by a CEO or
  // someone delegated that authority (the backend 403s otherwise), so the
  // (non-delegate) Campaign Approval tab must not offer Approve/Reject on
  // those rows.
  const canApproveCeoTier = user?.role === "SUPER_ADMIN" || isDelegate;

  // Reminders that have actually fired — a reminder never becomes a campaign
  // row (see reminderRecipientEstimate's comment), so this is fetched
  // separately from /reminders?status=FIRED and shown as its own tab.
  const canViewReminders =
    user?.role === "SUPER_ADMIN" || hasPermission(rolePermissions, "SCHEDULE_VIEW");

  React.useEffect(() => {
    if (!canViewReminders) {
      setRemindersLoading(false);
      return;
    }
    let cancelled = false;
    setRemindersLoading(true);
    remindersApi
      .list()
      .then((data) => {
        // PENDING_APPROVAL reminders live in their own Reminder Approval tab;
        // everything else (approved-and-waiting, fired, or rejected) belongs
        // here so a reminder never just vanishes once it's acted on.
        if (!cancelled) setSentReminders(data.filter((r) => r.status !== "PENDING_APPROVAL"));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRemindersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canViewReminders]);

  // Reminders now require approval before they're eligible to fire (one-tier
  // only — never the CEO/delegate tier), mirroring the campaign approval gate.
  const canApproveReminders =
    user?.role === "SUPER_ADMIN" || hasPermission(rolePermissions, "SCHEDULE_APPROVE");

  // Retrying re-sends only what an earlier approval already covered, so it's
  // open to anyone who could have submitted/approved the send — matching the
  // backend's retry-failed @PreAuthorize exactly so buttons never 403. A
  // VIEWER is read-only and can never retry (explicit guard, independent of
  // how permissions happen to be seeded).
  const canRetryCampaigns =
    user?.role !== "VIEWER" &&
    (user?.role === "SUPER_ADMIN" ||
      hasPermission(rolePermissions, "CAMPAIGN_SUBMIT") ||
      hasPermission(rolePermissions, "CAMPAIGN_APPROVE"));
  // Cancelling — including a campaign that's QUEUED and actively sending —
  // is restricted to the department head (and super admin), matching the
  // backend's CAMPAIGN_CANCEL authority exactly so the button never 403s.
  const canCancelCampaigns =
    user?.role === "SUPER_ADMIN" || hasPermission(rolePermissions, "CAMPAIGN_CANCEL");
  const canRetryReminders =
    user?.role !== "VIEWER" &&
    (user?.role === "SUPER_ADMIN" ||
      hasPermission(rolePermissions, "SCHEDULE_MANAGE") ||
      hasPermission(rolePermissions, "SCHEDULE_APPROVE"));

  const loadPendingReminders = React.useCallback(() => {
    if (!canApproveReminders) {
      setPendingRemindersLoading(false);
      return;
    }
    setPendingRemindersLoading(true);
    remindersApi
      .list("PENDING_APPROVAL")
      .then(setPendingReminders)
      .catch(() => {})
      .finally(() => setPendingRemindersLoading(false));
  }, [canApproveReminders]);

  React.useEffect(() => {
    loadPendingReminders();
  }, [loadPendingReminders]);

  // Delivery confirmation (DELIVERED/FAILED) happens asynchronously after a
  // campaign/reminder dispatches — the row fetched right after approval can
  // show 0/0 simply because nothing has reported back yet. Poll while
  // anything has messages still short of a terminal status, so the table
  // catches up instead of only being correct after a manual page reload.
  React.useEffect(() => {
    const hasInFlight = (list: { totalMessages: number; deliveredMessages: number; failedMessages: number }[]) =>
      list.some((x) => x.totalMessages > 0 && x.deliveredMessages + x.failedMessages < x.totalMessages);

    if (!hasInFlight(campaigns) && !hasInFlight(sentReminders)) return;

    const interval = setInterval(() => {
      campaignsApi.list().then(setCampaigns).catch(() => {});
      if (canViewReminders) {
        remindersApi
          .list()
          .then((data) => setSentReminders(data.filter((r) => r.status !== "PENDING_APPROVAL")))
          .catch(() => {});
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [campaigns, sentReminders, canViewReminders]);

  // ── Campaign tab filters/sort ──
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [kindFilter, setKindFilter] = React.useState("all");
  const [sortField, setSortField] = React.useState<CampaignSortField | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");

  // ── Activity tab filters/sort ──
  const [actSearch, setActSearch] = React.useState("");
  const [actKindFilter, setActKindFilter] = React.useState("all");
  const [actSort, setActSort] = React.useState<ActivitySortField | null>(null);
  const [actDir, setActDir] = React.useState<SortDir>("asc");

  // ── Approval tab filters/sort ──
  const [aprSearch, setAprSearch] = React.useState("");
  const [aprKindFilter, setAprKindFilter] = React.useState("all");
  const [aprSort, setAprSort] = React.useState<ApprovalSortField | null>(null);
  const [aprDir, setAprDir] = React.useState<SortDir>("asc");

  // ── Delegate Approval tab filters/sort ──
  const [delSearch, setDelSearch] = React.useState("");
  const [delKindFilter, setDelKindFilter] = React.useState("all");
  const [delSort, setDelSort] = React.useState<ApprovalSortField | null>(null);
  const [delDir, setDelDir] = React.useState<SortDir>("asc");

  // ── Reminders tab filter ──
  const [remSearch, setRemSearch] = React.useState("");

  // ── Reminder Approval tab filter ──
  const [remAprSearch, setRemAprSearch] = React.useState("");

  // ── Dialogs ──
  const [editTarget, setEditTarget] = React.useState<ApiCampaign | null>(null);
  const [editKey, setEditKey] = React.useState(0);
  const [previewTarget, setPreviewTarget] = React.useState<ApiCampaign | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<ApiCampaign | null>(null);
  const [cancelActing, setCancelActing] = React.useState(false);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);
  const [approvalTarget, setApprovalTarget] = React.useState<ApiCampaign | null>(null);
  const [approvalMode, setApprovalMode] = React.useState<"approve" | "reject">("approve");
  const [approvalActing, setApprovalActing] = React.useState(false);
  const [reminderPreviewTarget, setReminderPreviewTarget] = React.useState<ApiReminder | null>(null);
  const [reminderApprovalTarget, setReminderApprovalTarget] = React.useState<ApiReminder | null>(null);
  const [reminderApprovalMode, setReminderApprovalMode] = React.useState<"approve" | "reject">("approve");
  const [reminderApprovalActing, setReminderApprovalActing] = React.useState(false);
  const [retryTarget, setRetryTarget] = React.useState<
    { kind: "campaign" | "reminder"; id: string; name: string; failed: number } | null
  >(null);
  const [retryActing, setRetryActing] = React.useState(false);

  // ── Derived lists ──

  const activityCampaigns = React.useMemo(
    () => campaigns.filter((c) => c.totalMessages > 0),
    [campaigns],
  );

  const approvalCampaigns = React.useMemo(
    () => campaigns.filter((c) => APPROVAL_STATUSES.includes(c.status)),
    [campaigns],
  );

  const pendingApprovalCount = approvalCampaigns.length;

  // ── Filtered / sorted ──

  const filteredCampaigns = React.useMemo(() => {
    let result = campaigns.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.creatorName?.toLowerCase().includes(q) ?? false);
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      const matchKind = kindFilter === "all" || c.kind === kindFilter;
      return matchSearch && matchStatus && matchKind;
    });
    if (sortField) {
      result = [...result].sort((a, b) => {
        const av = String(a[sortField as keyof ApiCampaign] ?? "");
        const bv = String(b[sortField as keyof ApiCampaign] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [campaigns, search, statusFilter, kindFilter, sortField, sortDir]);

  const filteredActivities = React.useMemo(() => {
    let result = activityCampaigns.filter((c) => {
      const q = actSearch.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q);
      const matchKind = actKindFilter === "all" || c.kind === actKindFilter;
      return matchSearch && matchKind;
    });
    if (actSort) {
      result = [...result].sort((a, b) => {
        const av = String(a[actSort as keyof ApiCampaign] ?? "");
        const bv = String(b[actSort as keyof ApiCampaign] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return actDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [activityCampaigns, actSearch, actKindFilter, actSort, actDir]);

  const filteredApprovals = React.useMemo(() => {
    let result = approvalCampaigns.filter((c) => {
      const q = aprSearch.toLowerCase();
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.creatorName?.toLowerCase().includes(q) ?? false);
      const matchKind = aprKindFilter === "all" || c.kind === aprKindFilter;
      return matchSearch && matchKind;
    });
    if (aprSort) {
      result = [...result].sort((a, b) => {
        const av = String(a[aprSort as keyof ApiCampaign] ?? "");
        const bv = String(b[aprSort as keyof ApiCampaign] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return aprDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [approvalCampaigns, aprSearch, aprKindFilter, aprSort, aprDir]);

  const delegateCampaigns = React.useMemo(
    () => campaigns.filter((c) => c.status === "PENDING_CEO"),
    [campaigns],
  );

  const filteredDelegates = React.useMemo(() => {
    let result = delegateCampaigns.filter((c) => {
      const q = delSearch.toLowerCase();
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.creatorName?.toLowerCase().includes(q) ?? false);
      const matchKind = delKindFilter === "all" || c.kind === delKindFilter;
      return matchSearch && matchKind;
    });
    if (delSort) {
      result = [...result].sort((a, b) => {
        const av = String(a[delSort as keyof ApiCampaign] ?? "");
        const bv = String(b[delSort as keyof ApiCampaign] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return delDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [delegateCampaigns, delSearch, delKindFilter, delSort, delDir]);

  const filteredReminders = React.useMemo(() => {
    const q = remSearch.toLowerCase();
    if (!q) return sentReminders;
    return sentReminders.filter((r) => r.name.toLowerCase().includes(q));
  }, [sentReminders, remSearch]);

  const filteredPendingReminders = React.useMemo(() => {
    const q = remAprSearch.toLowerCase();
    if (!q) return pendingReminders;
    return pendingReminders.filter((r) => r.name.toLowerCase().includes(q));
  }, [pendingReminders, remAprSearch]);

  // ── Pagination ──

  const campaignPag = usePagination(filteredCampaigns.length);
  const activityPag = usePagination(filteredActivities.length);
  const approvalPag = usePagination(filteredApprovals.length);
  const delegatePag = usePagination(filteredDelegates.length);
  const reminderPag = usePagination(filteredReminders.length);
  const reminderAprPag = usePagination(filteredPendingReminders.length);

  React.useEffect(() => { campaignPag.reset(); }, [search, statusFilter, kindFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { activityPag.reset(); }, [actSearch, actKindFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { approvalPag.reset(); }, [aprSearch, aprKindFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { delegatePag.reset(); }, [delSearch, delKindFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { reminderPag.reset(); }, [remSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { reminderAprPag.reset(); }, [remAprSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const pagedCampaigns = filteredCampaigns.slice(
    campaignPag.pageStart,
    campaignPag.pageStart + campaignPag.rowsPerPage,
  );
  const pagedActivities = filteredActivities.slice(
    activityPag.pageStart,
    activityPag.pageStart + activityPag.rowsPerPage,
  );
  const pagedApprovals = filteredApprovals.slice(
    approvalPag.pageStart,
    approvalPag.pageStart + approvalPag.rowsPerPage,
  );
  const pagedDelegates = filteredDelegates.slice(
    delegatePag.pageStart,
    delegatePag.pageStart + delegatePag.rowsPerPage,
  );
  const pagedReminders = filteredReminders.slice(
    reminderPag.pageStart,
    reminderPag.pageStart + reminderPag.rowsPerPage,
  );
  const pagedPendingReminders = filteredPendingReminders.slice(
    reminderAprPag.pageStart,
    reminderAprPag.pageStart + reminderAprPag.rowsPerPage,
  );

  const campaignPlaceholders = campaignPag.rowsPerPage - pagedCampaigns.length;
  const activityPlaceholders = activityPag.rowsPerPage - pagedActivities.length;
  const approvalPlaceholders = approvalPag.rowsPerPage - pagedApprovals.length;
  const delegatePlaceholders = delegatePag.rowsPerPage - pagedDelegates.length;
  const reminderPlaceholders = reminderPag.rowsPerPage - pagedReminders.length;
  const reminderAprPlaceholders = reminderAprPag.rowsPerPage - pagedPendingReminders.length;

  // ── Sort handlers ──

  function handleCampaignSort(field: CampaignSortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }
  function handleActivitySort(field: ActivitySortField) {
    if (actSort === field) setActDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setActSort(field); setActDir("asc"); }
  }
  function handleApprovalSort(field: ApprovalSortField) {
    if (aprSort === field) setAprDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setAprSort(field); setAprDir("asc"); }
  }
  function handleDelegateSort(field: ApprovalSortField) {
    if (delSort === field) setDelDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setDelSort(field); setDelDir("asc"); }
  }

  // ── Action handlers ──

  async function handleSubmit(c: ApiCampaign) {
    setSubmittingId(c.id);
    try {
      const updated = await campaignsApi.submit(c.id);
      setCampaigns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast.success(`"${c.name}" submitted for approval.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to submit campaign."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSubmittingId(null);
    }
  }

  function handleEditSave(updated: ApiCampaign) {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditTarget(null);
    toast.success(`"${updated.name}" updated.`, {
      icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
    });
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    const name = cancelTarget.name;
    setCancelActing(true);
    try {
      const updated = await campaignsApi.cancel(cancelTarget.id);
      setCampaigns((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setCancelTarget(null);
      toast.success(`"${name}" has been cancelled.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to cancel campaign. It may have already been sent or cancelled — refresh and check its status."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setCancelActing(false);
    }
  }

  async function handleApprovalConfirm(reason?: string) {
    if (!approvalTarget) return;
    const name = approvalTarget.name;
    setApprovalActing(true);
    try {
      let updated: ApiCampaign;
      if (approvalMode === "approve") {
        updated = await campaignsApi.approve(approvalTarget.id);
      } else {
        updated = await campaignsApi.reject(approvalTarget.id, reason ?? "");
      }
      setCampaigns((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      setApprovalTarget(null);
      if (approvalMode === "approve") {
        toast.success(`"${name}" approved.`, {
          icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        });
      } else {
        toast.error(`"${name}" rejected and returned to Draft.`, {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 6000,
        });
      }
    } catch (err) {
      toast.error(
        apiErrorMessage(
          err,
          `Failed to ${approvalMode === "approve" ? "approve" : "reject"} campaign.`,
        ),
        { icon: <XCircle className="size-4" strokeWidth={2.5} />, duration: 7000 },
      );
    } finally {
      setApprovalActing(false);
    }
  }

  async function handleReminderApprovalConfirm(reason?: string) {
    if (!reminderApprovalTarget) return;
    const name = reminderApprovalTarget.name;
    setReminderApprovalActing(true);
    try {
      const updated =
        reminderApprovalMode === "approve"
          ? await remindersApi.approve(reminderApprovalTarget.id)
          : await remindersApi.reject(reminderApprovalTarget.id, reason ?? "");
      setPendingReminders((prev) => prev.filter((r) => r.id !== updated.id));
      // Move it into the Reminders tab immediately rather than leaving it to
      // only appear after a full page reload.
      setSentReminders((prev) => [updated, ...prev.filter((r) => r.id !== updated.id)]);
      setReminderApprovalTarget(null);
      if (reminderApprovalMode === "approve") {
        toast.success(`"${name}" approved.`, {
          icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        });
      } else {
        toast.error(`"${name}" rejected and returned to Draft.`, {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 6000,
        });
      }
    } catch (err) {
      toast.error(
        apiErrorMessage(
          err,
          `Failed to ${reminderApprovalMode === "approve" ? "approve" : "reject"} reminder.`,
        ),
        { icon: <XCircle className="size-4" strokeWidth={2.5} />, duration: 7000 },
      );
    } finally {
      setReminderApprovalActing(false);
    }
  }

  // Keeps the table row AND the currently-open preview dialog in sync with
  // the fresh stats the retry endpoint returns (failed drops, pending rises,
  // and the poll effect then follows the new deliveries in).
  function handleCampaignRetried(updated: ApiCampaign) {
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setPreviewTarget((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  function handleReminderRetried(updated: ApiReminder) {
    setSentReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setReminderPreviewTarget((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  async function handleRetryAllConfirm() {
    if (!retryTarget) return;
    setRetryActing(true);
    try {
      let retried: number;
      if (retryTarget.kind === "campaign") {
        const res = await campaignsApi.retryFailed(retryTarget.id);
        retried = res.retried;
        if (res.campaign) handleCampaignRetried(res.campaign);
      } else {
        const res = await remindersApi.retryFailed(retryTarget.id);
        retried = res.retried;
        if (res.reminder) handleReminderRetried(res.reminder);
      }
      setRetryTarget(null);
      toast.success(`${retried} message${retried === 1 ? "" : "s"} re-queued for delivery.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to retry messages."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setRetryActing(false);
    }
  }

  const campaignSortProps = { sortField, sortDir, onSort: handleCampaignSort };
  const actSortProps = { sortField: actSort, sortDir: actDir, onSort: handleActivitySort };
  const aprSortProps = { sortField: aprSort, sortDir: aprDir, onSort: handleApprovalSort };
  const delSortProps = { sortField: delSort, sortDir: delDir, onSort: handleDelegateSort };

  const KINDS = ["INSTANT", "SCHEDULED"];
  const STATUS_FILTER_OPTIONS = Object.entries(STATUS_DISPLAY).map(([v, d]) => ({ value: v, label: d.label }));

  // ── Skeleton rows ──
  function SkeletonRows({ cols }: { cols: number }) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={`sk-${i}`}>
            {Array.from({ length: cols }).map((__, j) => (
              <TableCell key={j} className={j === 0 ? "pl-4" : ""}>
                <Skeleton className="h-4 w-full max-w-32 rounded" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <TypographyH3>Campaign Management</TypographyH3>
          <TypographyMuted>
            Create, schedule, and manage bulk SMS campaigns.
          </TypographyMuted>
        </div>
        <Button onClick={() => navigate("/campaigns/new")} className="shrink-0" data-guide="campaign-new">
          <Plus className="size-4" />
          New Campaign
        </Button>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="campaigns">
        <TabsList data-guide="campaign-tabs">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="activity">Campaign Activity</TabsTrigger>
          {(user?.role === "DEPT_HEAD" || user?.role === "SUPER_ADMIN") && (
            <TabsTrigger value="approval" className="gap-2">
              Campaign Approval
              {pendingApprovalCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {pendingApprovalCount}
                </span>
              )}
            </TabsTrigger>
          )}
          {isDelegate && (
            <TabsTrigger value="delegate" className="gap-2">
              Delegate Approval
              {delegateCampaigns.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {delegateCampaigns.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {canViewReminders && (
            <TabsTrigger value="reminders" className="gap-2">
              Reminders
              {sentReminders.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {sentReminders.length}
                </span>
              )}
            </TabsTrigger>
          )}
          {canApproveReminders && (
            <TabsTrigger value="reminder-approval" className="gap-2">
              Reminder Approval
              {pendingReminders.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {pendingReminders.length}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Campaigns Tab ── */}
        <TabsContent value="campaigns" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3" data-guide="campaign-search">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={kindFilter}
              onValueChange={(v) => v !== null && setKindFilter(v)}
            >
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {kindFilter === "all"
                    ? "All Types"
                    : (KIND_DISPLAY[kindFilter]?.label ?? kindFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_DISPLAY[k]?.label ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => v !== null && setStatusFilter(v)}
            >
              <SelectTrigger className="min-w-44">
                <span className="flex-1 text-sm text-left">
                  {statusFilter === "all"
                    ? "All Statuses"
                    : (STATUS_DISPLAY[statusFilter]?.label ?? statusFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table pagination={campaignPag.bar}>
            <TableHeader>
              <TableRow>
                <SortableHead field="name" {...campaignSortProps} className="pl-4 w-64">
                  Campaign Name
                </SortableHead>
                <SortableHead field="kind" {...campaignSortProps}>Type</SortableHead>
                <SortableHead field="status" {...campaignSortProps}>Status</SortableHead>
                <SortableHead field="recipientCount" {...campaignSortProps}>Recipients</SortableHead>
                <TableHead>Message</TableHead>
                <SortableHead field="scheduledAt" {...campaignSortProps}>Date</SortableHead>
                <SortableHead field="creatorName" {...campaignSortProps}>Created By</SortableHead>
                <TableHead className="w-28 text-left">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody
              key={campaignPag.pageKey}
              className="animate-in fade-in duration-200"
            >
              {loading ? (
                <SkeletonRows cols={8} />
              ) : pagedCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No campaigns match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {pagedCampaigns.map((c) => {
                    const canEdit = c.status === "DRAFT";
                    // The backend's /campaigns/{id}/submit rejects with 403
                    // unless the caller both holds CAMPAIGN_SUBMIT and is the
                    // campaign's own creator — match both here so the button
                    // is disabled instead of failing after the click.
                    const canSubmit =
                      c.status === "DRAFT" &&
                      c.createdBy === user?.id &&
                      hasPermission(rolePermissions, "CAMPAIGN_SUBMIT");
                    const canCancel =
                      (c.status === "APPROVED" || c.status === "QUEUED") &&
                      canCancelCampaigns;
                    const dateLabel = c.scheduledAt ?? c.createdAt;
                    return (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => setPreviewTarget(c)}>
                        <TableCell className="pl-4 font-medium max-w-64">
                          <span className="block truncate">{c.name}</span>
                        </TableCell>
                        <TableCell>
                          <KindBadge kind={c.kind} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {(() => {
                            const est = campaignRecipientEstimate(c, pageGroups, pageTemplates);
                            return est != null && est > 0 ? (
                              est.toLocaleString()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="max-w-52">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {(() => {
                              const preview = messagePreviewFor(c, pageTemplates);
                              return (
                                <>
                                  {preview.isTemplate && (
                                    <LayoutTemplate className="size-3 shrink-0 text-violet-600 dark:text-violet-400" />
                                  )}
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {preview.text}
                                  </span>
                                </>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                          {formatDate(dateLabel)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.creatorName ?? "—"}
                        </TableCell>
                        <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setPreviewTarget(c)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setEditKey((k) => k + 1);
                                setEditTarget(c);
                              }}
                              disabled={!canEdit}
                            >
                              <SquarePen className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={
                                c.status === "DRAFT" && c.createdBy !== user?.id
                                  ? "Only the creator can submit this campaign"
                                  : "Submit for approval"
                              }
                              onClick={() => handleSubmit(c)}
                              disabled={!canSubmit || submittingId === c.id}
                            >
                              <Send className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setCancelTarget(c)}
                              disabled={!canCancel}
                            >
                              <PowerOff className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {Array.from({ length: campaignPlaceholders }).map((_, i) => (
                    <TableRow key={`ph-${i}`} className="pointer-events-none border-b-0 hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0 h-10" />
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── Campaign Activity Tab ── */}
        <TabsContent value="activity" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search activity..."
                value={actSearch}
                onChange={(e) => setActSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={actKindFilter}
              onValueChange={(v) => v !== null && setActKindFilter(v)}
            >
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {actKindFilter === "all"
                    ? "All Types"
                    : (KIND_DISPLAY[actKindFilter]?.label ?? actKindFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_DISPLAY[k]?.label ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table pagination={activityPag.bar}>
            <TableHeader>
              <TableRow>
                <SortableHead field="name" {...actSortProps} className="pl-4 w-64">
                  Campaign Name
                </SortableHead>
                <SortableHead field="kind" {...actSortProps}>Type</SortableHead>
                <SortableHead field="totalMessages" {...actSortProps}>Total Sent</SortableHead>
                <SortableHead field="deliveredMessages" {...actSortProps}>Delivered</SortableHead>
                <SortableHead field="failedMessages" {...actSortProps}>Failed</SortableHead>
                <SortableHead field="deliveryRatePct" {...actSortProps}>Delivery Rate</SortableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-14 text-left">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody
              key={activityPag.pageKey}
              className="animate-in fade-in duration-200"
            >
              {loading ? (
                <SkeletonRows cols={8} />
              ) : pagedActivities.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No activity data available.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {pagedActivities.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setPreviewTarget(c)}>
                      <TableCell className="pl-4 font-medium max-w-64">
                        <span className="block truncate">{c.name}</span>
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={c.kind} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {c.totalMessages.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums text-green-600 dark:text-green-400 font-medium">
                          {c.deliveredMessages.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="tabular-nums text-destructive font-medium">
                          {c.failedMessages.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-28">
                          <Progress
                            value={c.deliveryRatePct}
                            className="h-1.5 flex-1"
                          />
                          <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                            {c.deliveryRatePct.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                        {formatDate(c.scheduledAt ?? c.createdAt)}
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPreviewTarget(c)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          {canRetryCampaigns && c.failedMessages > 0 && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                              title={`Retry ${c.failedMessages.toLocaleString()} failed message${c.failedMessages === 1 ? "" : "s"}`}
                              onClick={() =>
                                setRetryTarget({
                                  kind: "campaign",
                                  id: c.id,
                                  name: c.name,
                                  failed: c.failedMessages,
                                })
                              }
                            >
                              <RotateCcw className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {Array.from({ length: activityPlaceholders }).map((_, i) => (
                    <TableRow key={`ph-${i}`} className="pointer-events-none border-b-0 hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0 h-10" />
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── Campaign Approval Tab ── */}
        <TabsContent value="approval" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search approvals..."
                value={aprSearch}
                onChange={(e) => setAprSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={aprKindFilter}
              onValueChange={(v) => v !== null && setAprKindFilter(v)}
            >
              <SelectTrigger className="min-w-32">
                <span className="flex-1 text-sm text-left">
                  {aprKindFilter === "all"
                    ? "All Types"
                    : (KIND_DISPLAY[aprKindFilter]?.label ?? aprKindFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_DISPLAY[k]?.label ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table pagination={approvalPag.bar}>
            <TableHeader>
              <TableRow>
                <SortableHead field="name" {...aprSortProps} className="pl-4 w-64">
                  Campaign Name
                </SortableHead>
                <SortableHead field="kind" {...aprSortProps}>Type</SortableHead>
                <SortableHead field="recipientCount" {...aprSortProps}>Recipients</SortableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Created By</TableHead>
                <SortableHead field="createdAt" {...aprSortProps}>Created</SortableHead>
                <SortableHead field="status" {...aprSortProps}>Status</SortableHead>
                <TableHead className="w-40 text-left">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody
              key={approvalPag.pageKey}
              className="animate-in fade-in duration-200"
            >
              {loading ? (
                <SkeletonRows cols={8} />
              ) : pagedApprovals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No pending approval requests.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {pagedApprovals.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setPreviewTarget(c)}>
                      <TableCell className="pl-4 font-medium max-w-64">
                        <span className="block truncate">{c.name}</span>
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={c.kind} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {campaignRecipientEstimate(c, pageGroups, pageTemplates)?.toLocaleString() ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(c.scheduledAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.creatorName ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPreviewTarget(c)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          {c.status === "PENDING_CEO" && !canApproveCeoTier ? (
                            <span className="text-xs text-muted-foreground italic">
                              Requires delegate approval
                            </span>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-900/20"
                                onClick={() => {
                                  setApprovalMode("approve");
                                  setApprovalTarget(c);
                                }}
                              >
                                <Check className="size-3" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => {
                                  setApprovalMode("reject");
                                  setApprovalTarget(c);
                                }}
                              >
                                <XCircle className="size-3" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {Array.from({ length: approvalPlaceholders }).map((_, i) => (
                    <TableRow key={`ph-${i}`} className="pointer-events-none border-b-0 hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0 h-10" />
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* ── Delegate Approval Tab ── */}
        {isDelegate && (
          <TabsContent value="delegate" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search delegate approvals..."
                  value={delSearch}
                  onChange={(e) => setDelSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={delKindFilter}
                onValueChange={(v) => v !== null && setDelKindFilter(v)}
              >
                <SelectTrigger className="min-w-32">
                  <span className="flex-1 text-sm text-left">
                    {delKindFilter === "all"
                      ? "All Types"
                      : (KIND_DISPLAY[delKindFilter]?.label ?? delKindFilter)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_DISPLAY[k]?.label ?? k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Table pagination={delegatePag.bar}>
              <TableHeader>
                <TableRow>
                  <SortableHead field="name" {...delSortProps} className="pl-4 w-64">
                    Campaign Name
                  </SortableHead>
                  <SortableHead field="kind" {...delSortProps}>Type</SortableHead>
                  <SortableHead field="recipientCount" {...delSortProps}>Recipients</SortableHead>
                  <TableHead>Scheduled Date</TableHead>
                  <TableHead>Created By</TableHead>
                  <SortableHead field="createdAt" {...delSortProps}>Created</SortableHead>
                  <SortableHead field="status" {...delSortProps}>Status</SortableHead>
                  <TableHead className="w-40 text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody
                key={delegatePag.pageKey}
                className="animate-in fade-in duration-200"
              >
                {loading ? (
                  <SkeletonRows cols={8} />
                ) : pagedDelegates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No campaigns pending delegate approval.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {pagedDelegates.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => setPreviewTarget(c)}>
                        <TableCell className="pl-4 font-medium max-w-64">
                          <span className="block truncate">{c.name}</span>
                        </TableCell>
                        <TableCell>
                          <KindBadge kind={c.kind} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {campaignRecipientEstimate(c, pageGroups, pageTemplates)?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(c.scheduledAt)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.creatorName ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(c.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setPreviewTarget(c)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-900/20"
                              onClick={() => {
                                setApprovalMode("approve");
                                setApprovalTarget(c);
                              }}
                            >
                              <Check className="size-3" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                              onClick={() => {
                                setApprovalMode("reject");
                                setApprovalTarget(c);
                              }}
                            >
                              <XCircle className="size-3" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {Array.from({ length: delegatePlaceholders }).map((_, i) => (
                      <TableRow key={`ph-${i}`} className="pointer-events-none border-b-0 hover:bg-transparent">
                        <TableCell colSpan={8} className="p-0 h-10" />
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        )}

        {/* ── Reminders Tab ── */}
        {canViewReminders && (
          <TabsContent value="reminders" className="mt-4 space-y-4">
            <TypographyMuted className="text-xs">
              Every reminder that's been approved, rejected, or sent, with
              delivery status for the messages each one sent.
            </TypographyMuted>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search reminders..."
                  value={remSearch}
                  onChange={(e) => setRemSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <Table pagination={reminderPag.bar}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 w-64">Reminder Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Delivery Rate</TableHead>
                  <TableHead>Fires Every</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-14 text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody
                key={reminderPag.pageKey}
                className="animate-in fade-in duration-200"
              >
                {remindersLoading ? (
                  <SkeletonRows cols={9} />
                ) : pagedReminders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      No reminders have been approved, rejected, or sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {pagedReminders.map((r) => {
                      const est = reminderRecipientEstimate(r, pageGroups, pageTemplates);
                      const recipientCount = r.totalMessages > 0 ? r.totalMessages : est;
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer"
                          onClick={() => setReminderPreviewTarget(r)}
                        >
                          <TableCell className="pl-4 font-medium max-w-64">
                            <span className="block truncate">{r.name}</span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={r.status} />
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {recipientCount != null ? recipientCount.toLocaleString() : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="tabular-nums text-green-600 dark:text-green-400 font-medium">
                              {r.deliveredMessages.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="tabular-nums text-destructive font-medium">
                              {r.failedMessages.toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-28">
                              <Progress
                                value={r.deliveryRatePct}
                                className="h-1.5 flex-1"
                              />
                              <span className="tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                                {r.deliveryRatePct.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.triggerDays} day{r.triggerDays === 1 ? "" : "s"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(r.createdAt)}
                          </TableCell>
                          <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setReminderPreviewTarget(r)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              {canRetryReminders && r.failedMessages > 0 && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-destructive hover:text-destructive"
                                  title={`Retry ${r.failedMessages.toLocaleString()} failed message${r.failedMessages === 1 ? "" : "s"}`}
                                  onClick={() =>
                                    setRetryTarget({
                                      kind: "reminder",
                                      id: r.id,
                                      name: r.name,
                                      failed: r.failedMessages,
                                    })
                                  }
                                >
                                  <RotateCcw className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {Array.from({ length: reminderPlaceholders }).map((_, i) => (
                      <TableRow key={`ph-${i}`} className="pointer-events-none border-b-0 hover:bg-transparent">
                        <TableCell colSpan={9} className="p-0 h-10" />
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        )}

        {/* ── Reminder Approval Tab ── */}
        {canApproveReminders && (
          <TabsContent value="reminder-approval" className="mt-4 space-y-4">
            <TypographyMuted className="text-xs">
              Reminders need approval before they become eligible to fire.
              Reminders never go through delegate/CEO approval — one tier only.
            </TypographyMuted>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search reminders..."
                  value={remAprSearch}
                  onChange={(e) => setRemAprSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <Table pagination={reminderAprPag.bar}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 w-64">Reminder Name</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Fires Every</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-40 text-left">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody
                key={reminderAprPag.pageKey}
                className="animate-in fade-in duration-200"
              >
                {pendingRemindersLoading ? (
                  <SkeletonRows cols={5} />
                ) : pagedPendingReminders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No reminders pending approval.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {pagedPendingReminders.map((r) => {
                      const est = reminderRecipientEstimate(r, pageGroups, pageTemplates);
                      return (
                        <TableRow
                          key={r.id}
                          className="cursor-pointer"
                          onClick={() => setReminderPreviewTarget(r)}
                        >
                          <TableCell className="pl-4 font-medium max-w-64">
                            <span className="block truncate">{r.name}</span>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {est != null ? est.toLocaleString() : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.triggerDays} day{r.triggerDays === 1 ? "" : "s"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(r.createdAt)}
                          </TableCell>
                          <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setReminderPreviewTarget(r)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-900/20"
                                onClick={() => {
                                  setReminderApprovalMode("approve");
                                  setReminderApprovalTarget(r);
                                }}
                              >
                                <Check className="size-3" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => {
                                  setReminderApprovalMode("reject");
                                  setReminderApprovalTarget(r);
                                }}
                              >
                                <XCircle className="size-3" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {Array.from({ length: reminderAprPlaceholders }).map((_, i) => (
                      <TableRow key={`ph-${i}`} className="pointer-events-none border-b-0 hover:bg-transparent">
                        <TableCell colSpan={5} className="p-0 h-10" />
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Campaign Dialog */}
      <EditCampaignDialog
        key={editKey}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        campaign={editTarget}
        onSave={handleEditSave}
      />

      {/* Campaign Preview Dialog */}
      <LivePreviewDialog
        open={!!previewTarget}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
        campaign={previewTarget}
        templates={pageTemplates}
        groups={pageGroups}
        canRetry={canRetryCampaigns}
        canCancel={canCancelCampaigns}
        onCampaignUpdated={handleCampaignRetried}
        onCancel={(c) => {
          setPreviewTarget(null);
          setCancelTarget(c);
        }}
      />

      {/* Reminder Recipients Dialog */}
      <ReminderRecipientsDialog
        open={!!reminderPreviewTarget}
        onOpenChange={(open) => !open && setReminderPreviewTarget(null)}
        reminder={reminderPreviewTarget}
        templates={pageTemplates}
        canRetry={canRetryReminders}
        onReminderUpdated={handleReminderRetried}
      />

      {/* Reminder Approve/Reject Dialog */}
      <ReminderApprovalDialog
        open={!!reminderApprovalTarget}
        onOpenChange={(open) => !open && setReminderApprovalTarget(null)}
        reminder={reminderApprovalTarget}
        mode={reminderApprovalMode}
        onConfirm={handleReminderApprovalConfirm}
        acting={reminderApprovalActing}
        templates={pageTemplates}
      />

      {/* Cancel Confirmation */}
      <Dialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cancelTarget?.status === "QUEUED" ? "Cancel While Sending?" : "Cancel Campaign?"}
            </DialogTitle>
            <DialogDescription>
              {cancelTarget?.status === "QUEUED"
                ? <>&quot;{cancelTarget?.name}&quot; is currently sending. Cancelling now stops delivery to
                    every recipient who hasn&apos;t received it yet — messages already sent cannot be
                    recalled, and this cannot be undone.</>
                : <>Are you sure you want to cancel &quot;{cancelTarget?.name}&quot;? It will not be sent,
                    and this cannot be undone.</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelActing}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelActing}
            >
              {cancelActing ? "Cancelling..." : "Cancel Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve / Reject Dialog */}
      <ApproveRejectDialog
        open={!!approvalTarget}
        onOpenChange={(open) => !open && setApprovalTarget(null)}
        campaign={approvalTarget}
        mode={approvalMode}
        onConfirm={handleApprovalConfirm}
        acting={approvalActing}
        templates={pageTemplates}
      />

      {/* Retry-all-failed Confirmation */}
      <Dialog
        open={!!retryTarget}
        onOpenChange={(open) => !open && setRetryTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry Failed Messages</DialogTitle>
            <DialogDescription>
              Re-send {retryTarget?.failed.toLocaleString()} failed message
              {retryTarget?.failed === 1 ? "" : "s"} of &quot;{retryTarget?.name}
              &quot;? They&apos;ll be queued for delivery immediately — no new
              approval is needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRetryTarget(null)}
              disabled={retryActing}
            >
              Cancel
            </Button>
            <Button onClick={handleRetryAllConfirm} disabled={retryActing}>
              <RotateCcw className={cn("size-4", retryActing && "animate-spin")} />
              {retryActing ? "Retrying..." : "Retry All Failed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
