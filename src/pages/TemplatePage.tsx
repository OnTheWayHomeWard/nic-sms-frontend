"use client";

import * as React from "react";
import {
  ArrowUpDown,
  Ban,
  Check,
  CheckCircle2,
  Eye,
  Plus,
  Search,
  SquarePen,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  TypographyH4,
  TypographyMuted,
  TypographySmall,
} from "@/components/ui/typography";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { headersToVariables, sampleFromHeaders, sampleFromMember } from "@/lib/templates";
import { useAuth } from "@/contexts/AuthContext";
import {
  apiErrorMessage,
  groupsApi,
  templatesApi,
  type ApiGroup,
  type ApiTemplate,
  type GroupMember,
} from "@/lib/services";

// ─── Types & helpers ─────────────────────────────────────────────────────────

type ApprovalSortField =
  | "name"
  | "encoding"
  | "creatorName"
  | "createdAt"
  | "status";
type SortDir = "asc" | "desc";

const DEFAULT_SENDER = "NibInsure (8559)";

/** Backend template status → UI label + badge colours. */
const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Pending",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  },
  APPROVED: {
    label: "Approved",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  },
  RETIRED: {
    label: "Retired",
    className: "bg-muted text-muted-foreground",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_DISPLAY[status] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("border-0", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

/** Extract `["Name","PolicyNo"]` from a body containing `{{Name}} {{PolicyNo}}`. */
function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{([^}]+)\}\}/g) ?? [];
  const names = matches.map((m) => m.slice(2, -2).trim());
  return [...new Set(names)];
}

/** GSM-7 unless the body contains non-ASCII characters (→ UCS-2). */
function detectEncoding(body: string): "GSM7" | "UCS2" {
  return /[^\x00-\x7F]/.test(body) ? "UCS2" : "GSM7";
}


function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

/**
 * The backend's recipientCount only counts inline recipients
 * (template_recipient rows) — for a group-based template it's always 0, so
 * the group's own memberCount (already loaded alongside templates) is used
 * instead. Falls back to the raw count when the group can't be found (e.g.
 * it was deactivated after the template was created).
 */
function templateRecipientCount(
  template: ApiTemplate,
  groups: ApiGroup[],
): number {
  if (template.recipientGroupId) {
    const group = groups.find((g) => g.id === template.recipientGroupId);
    return group?.memberCount ?? template.recipientCount;
  }
  return template.recipientCount;
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

function sampleFromTemplateRecipient(
  phoneE164: string,
  name: string | null,
  variables: string[],
): Record<string, string> {
  // Header placeholders first, then override with the recipient's real values.
  return {
    ...sampleFromHeaders(variables),
    ...sampleFromMember(variables, { phoneE164, name: name ?? undefined }),
  };
}

// ─── Pagination hook ───────────────────────────────────────────────────────────

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
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(1)}
            disabled={safePage === 1}
          >
            «
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(safePage - 1)}
            disabled={safePage === 1}
          >
            ‹
          </Button>
          <span className="px-2 text-muted-foreground text-xs whitespace-nowrap">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(safePage + 1)}
            disabled={safePage === totalPages}
          >
            ›
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => goToPage(totalPages)}
            disabled={safePage === totalPages}
          >
            »
          </Button>
        </div>
      </div>
    </div>
  );

  return { pageStart, rowsPerPage, pageKey, bar, reset };
}

function SortableHead<T extends string>({
  children,
  field,
  sortField,
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

// ─── Template Form Dialog (create / edit) ──────────────────────────────────────

interface TemplateSaveData {
  name: string;
  body: string;
  sender: string;
  variables: string[];
  encoding: string;
  recipientGroupId: string;
}

interface TemplateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialTemplate?: ApiTemplate;
  groups: ApiGroup[];
  saving: boolean;
  onSave: (data: TemplateSaveData) => void;
}

function TemplateFormDialog({
  open,
  onOpenChange,
  mode,
  initialTemplate,
  groups,
  saving,
  onSave,
}: TemplateFormDialogProps) {
  const [name, setName] = React.useState(initialTemplate?.name ?? "");
  const [body, setBody] = React.useState(initialTemplate?.body ?? "");
  const [groupId, setGroupId] = React.useState(
    initialTemplate?.recipientGroupId ?? "",
  );
  const [groupFirstMemberSample, setGroupFirstMemberSample] = React.useState<Record<string, string>>({});

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const sender = initialTemplate?.sender ?? DEFAULT_SENDER;
  const charCount = body.length;
  const smsCount = Math.ceil(charCount / 160) || 1;

  const selectedGroup = groups.find((g) => g.id === groupId);
  const activeHeaders = selectedGroup?.fields ?? [];
  const suggestionHeaders =
    activeHeaders.length > 0
      ? activeHeaders
      : (initialTemplate?.variables ?? extractVariables(body));
  const dynamicVariables = headersToVariables(suggestionHeaders);

  React.useEffect(() => {
    const fields = selectedGroup?.fields ?? [];
    if (!groupId) { setGroupFirstMemberSample({}); return; }
    groupsApi.listMembers(groupId).then((members) => {
      if (members.length === 0) { setGroupFirstMemberSample({}); return; }
      setGroupFirstMemberSample(sampleFromMember(fields, members[0]));
    }).catch(() => {});
  }, [groupId, selectedGroup]);

  const previewNodes = React.useMemo(() => {
    // Real values from the first group member override header placeholders.
    const sample = {
      ...sampleFromHeaders(suggestionHeaders),
      ...groupFirstMemberSample,
    };
    return resolvePreviewNodes(body, sample);
  }, [body, suggestionHeaders, groupFirstMemberSample]);

  function insertVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody((prev) => prev + variable);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + variable + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function handleSave() {
    const missing: string[] = [];
    if (!name.trim()) missing.push("a template name");
    if (!groupId) missing.push("a contact group");
    if (!body.trim()) missing.push("a message");
    if (missing.length > 0) {
      toast.error(`Please provide ${missing.join(", ")}.`, {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }
    onSave({
      name: name.trim(),
      body: body.trim(),
      sender,
      variables: extractVariables(body),
      encoding: detectEncoding(body),
      recipientGroupId: groupId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader guideId="template-form">
          <DialogTitle>
            <TypographyH4>
              {mode === "create" ? "Create Template" : "Edit Template"}
            </TypographyH4>
          </DialogTitle>
          <DialogDescription>
            Templates start as a draft and become usable once approved.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="-mx-4 no-scrollbar max-h-[65vh] overflow-y-auto px-4">
          <div className="space-y-6">
            {/* Template Name */}
            <div className="space-y-2.5" data-guide="tf-name">
              <Label className="my-2.5" htmlFor="tpl-name">
                Template Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tpl-name"
                placeholder="e.g. Holiday Wishes"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <Separator />

            {/* Two-column: Recipients | Compose */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* Left: Contact group (required) */}
              <div className="pb-6 md:pb-0 md:pr-6 space-y-4" data-guide="tf-recipients">
                <div>
                  <p className="font-semibold my-2 text-sm">
                    Recipients <span className="text-destructive">*</span>
                  </p>
                  <TypographyMuted>
                    Select a contact group. Required before writing the message.
                  </TypographyMuted>
                </div>

                <div className="space-y-3">
                  <SearchableSelect
                    items={groups.map((g) => ({ value: g.id, label: g.name }))}
                    value={groupId}
                    onValueChange={setGroupId}
                    placeholder="Select contact group"
                    searchPlaceholder="Search contact groups…"
                    emptyText="No contact groups found."
                  />

                  {selectedGroup && (
                    <div className="rounded-lg border bg-accent/20 p-3 space-y-1.5">
                      <TypographySmall className="text-muted-foreground">
                        {selectedGroup.memberCount.toLocaleString()}{" "}
                        recipients · columns:
                      </TypographySmall>
                      <div className="flex flex-wrap gap-1">
                        {selectedGroup.fields.length > 0 ? (
                          selectedGroup.fields.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
                            >
                              {f}
                            </span>
                          ))
                        ) : (
                          <TypographyMuted>No columns detected.</TypographyMuted>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Compose — gated behind a contact group */}
              <div className="pt-6 md:pt-0 md:pl-6 space-y-4" data-guide="tf-message">
                <div>
                  <p className="font-semibold my-2 text-sm">
                    {mode === "create" ? "Compose" : "Edit message"}
                  </p>
                  <TypographyMuted>Write message format</TypographyMuted>
                </div>

                {groupId ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label
                          className="my-1 font-normal"
                          htmlFor="tpl-message"
                        >
                          Message Text{" "}
                          <span className="text-destructive">*</span>
                        </Label>
                        <TypographyMuted className="text-xs">
                          {charCount}/160
                        </TypographyMuted>
                      </div>
                      <Textarea
                        id="tpl-message"
                        ref={textareaRef}
                        placeholder="Dear {{Name}}, ..."
                        rows={5}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="resize-none"
                      />
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <TypographyMuted className="text-xs">
                        {charCount} / 160 chars · {smsCount} SMS ·{" "}
                        {detectEncoding(body)}
                      </TypographyMuted>
                      <div className="flex gap-1.5 flex-wrap" data-guide="tf-variables">
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
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed bg-accent/20 px-4 py-8 text-center">
                    <TypographyMuted>
                      Select a contact group to start writing — message variables
                      come from its columns.
                    </TypographyMuted>
                  </div>
                )}
              </div>
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
                  FROM: {sender}
                </TypographySmall>
                {body.trim() ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {previewNodes}
                  </p>
                ) : (
                  <TypographyMuted className="italic">
                    Start typing a message to see the preview.
                  </TypographyMuted>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !groupId || !body.trim()}
          >
            {saving ? "Saving..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approve / Reject Dialog ────────────────────────────────────────────────────

function ApproveRejectDialog({
  open,
  onOpenChange,
  template,
  mode,
  acting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ApiTemplate | null;
  mode: "approve" | "reject";
  acting: boolean;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "approve" ? "Approve Template" : "Reject Template"}
          </DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? `Approve "${template.name}" to make it available for campaigns.`
              : `Reject "${template.name}" and notify the creator.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-accent/20 p-3 space-y-1 text-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Message Body
          </p>
          <p className="leading-relaxed text-xs">{template.body}</p>
        </div>

        {mode === "reject" && (
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason for rejection</Label>
            <Textarea
              id="reject-reason"
              placeholder="Explain why this template is being rejected..."
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

// ─── Preview Dialog ─────────────────────────────────────────────────────────────

function TemplatePreviewDialog({
  open,
  onOpenChange,
  template,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: ApiTemplate | null;
  groups: ApiGroup[];
}) {
  const [recipientSearch, setRecipientSearch] = React.useState("");
  const [groupMembers, setGroupMembers] = React.useState<GroupMember[]>([]);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);

  React.useEffect(() => {
    if (!open || !template?.recipientGroupId) {
      setGroupMembers([]);
      setRecipientSearch("");
      return;
    }
    setLoadingRecipients(true);
    groupsApi
      .listMembers(template.recipientGroupId)
      .then(setGroupMembers)
      .catch(() => setGroupMembers([]))
      .finally(() => setLoadingRecipients(false));
  }, [open, template?.recipientGroupId]);

  if (!template) return null;

  const isGroupBased = !!template.recipientGroupId;
  const group = isGroupBased
    ? groups.find((g) => g.id === template.recipientGroupId)
    : undefined;
  const recipients = isGroupBased
    ? groupMembers.map((m) => ({ phone: m.phoneE164 ?? m.phone ?? "", name: m.name }))
    : template.recipients.map((r) => ({ phone: r.phoneE164, name: r.name ?? undefined }));
  const recipientCount = templateRecipientCount(template, groups);

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
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>
            Submitted by {template.creatorName ?? "—"} on{" "}
            {formatDate(template.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border bg-accent/20 p-3 space-y-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              FROM: {template.sender ?? DEFAULT_SENDER}
            </p>
            <p className="leading-relaxed">
              {resolvePreviewNodes(
                template.body,
                template.recipients.length > 0
                  ? sampleFromTemplateRecipient(
                      template.recipients[0].phoneE164,
                      template.recipients[0].name,
                      template.variables,
                    )
                  : sampleFromHeaders(template.variables),
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Encoding:{" "}
              <span className="font-mono font-medium text-foreground">
                {template.encoding ?? "GSM7"}
              </span>
            </span>
            <span>
              Status: <StatusBadge status={template.status} />
            </span>
          </div>
          {template.rejectionReason && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <p className="font-medium mb-1">Rejection reason:</p>
              <p>{template.rejectionReason}</p>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Recipients ({recipientCount.toLocaleString()})
          </p>
          {isGroupBased && (
            <TypographyMuted className="text-xs">
              From contact group &quot;{group?.name ?? "—"}&quot;
            </TypographyMuted>
          )}
          {loadingRecipients ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <TypographyMuted className="text-sm italic">
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
              <ScrollArea className="h-48 rounded-md border">
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
                        <span className="font-mono text-xs text-muted-foreground w-36 shrink-0">
                          {r.phone || "—"}
                        </span>
                        {r.name && (
                          <span className="truncate text-foreground">{r.name}</span>
                        )}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Template Page ───────────────────────────────────────────────────────────────

export default function TemplatePage() {
  const { user } = useAuth();

  const [templates, setTemplates] = React.useState<ApiTemplate[]>([]);
  const [groups, setGroups] = React.useState<ApiGroup[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ApiTemplate | null>(null);
  const [editKey, setEditKey] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [retireTarget, setRetireTarget] = React.useState<ApiTemplate | null>(
    null,
  );
  const [reactivateTarget, setReactivateTarget] =
    React.useState<ApiTemplate | null>(null);
  const [reactivating, setReactivating] = React.useState(false);

  // Approval state
  const [aprSearch, setAprSearch] = React.useState("");
  const [aprStatusFilter, setAprStatusFilter] = React.useState("all");
  const [aprSort, setAprSort] = React.useState<ApprovalSortField | null>(null);
  const [aprDir, setAprDir] = React.useState<SortDir>("asc");
  const [approvalTarget, setApprovalTarget] =
    React.useState<ApiTemplate | null>(null);
  const [approvalMode, setApprovalMode] = React.useState<"approve" | "reject">(
    "approve",
  );
  const [approvalActing, setApprovalActing] = React.useState(false);
  const [previewTarget, setPreviewTarget] = React.useState<ApiTemplate | null>(
    null,
  );

  // ── Load ──
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([templatesApi.list(), groupsApi.list()])
      .then(([tpls, grps]) => {
        if (cancelled) return;
        setTemplates(tpls);
        setGroups(grps);
      })
      .catch((err) => {
        if (!cancelled)
          toast.error(apiErrorMessage(err, "Failed to load templates."), {
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

  function upsert(updated: ApiTemplate) {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === updated.id);
      return exists
        ? prev.map((t) => (t.id === updated.id ? updated : t))
        : [updated, ...prev];
    });
  }

  // ── Create / edit ──
  async function handleCreate(data: TemplateSaveData) {
    setSaving(true);
    try {
      const created = await templatesApi.create({
        name: data.name,
        body: data.body,
        sender: data.sender,
        encoding: data.encoding,
        variables: data.variables,
        recipientGroupId: data.recipientGroupId,
      });
      upsert(created);
      setCreateOpen(false);
      toast.success("Template created — pending approval.", {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create template."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data: TemplateSaveData) {
    if (!editTarget) return;
    setSaving(true);
    try {
      await templatesApi.update(editTarget.id, {
        name: data.name,
        body: data.body,
        sender: data.sender,
        encoding: data.encoding,
        variables: data.variables,
        recipientGroupId: data.recipientGroupId,
      });
      const fresh = await templatesApi.get(editTarget.id);
      upsert(fresh);
      setEditTarget(null);
      toast.success(`"${data.name}" updated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update template."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRetire() {
    if (!retireTarget) return;
    const name = retireTarget.name;
    try {
      const updated = await templatesApi.retire(retireTarget.id);
      upsert(updated);
      setRetireTarget(null);
      toast.success(`"${name}" deactivated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to deactivate template."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleReactivate() {
    if (!reactivateTarget) return;
    const template = reactivateTarget;
    setReactivating(true);
    try {
      const updated = await templatesApi.reactivate(template.id);
      upsert(updated);
      setReactivateTarget(null);
      toast.success(`"${template.name}" reactivated — back to draft.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to reactivate template."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setReactivating(false);
    }
  }

  async function handleApprovalConfirm(reason?: string) {
    if (!approvalTarget) return;
    const name = approvalTarget.name;
    setApprovalActing(true);
    try {
      const updated =
        approvalMode === "approve"
          ? await templatesApi.approve(approvalTarget.id)
          : await templatesApi.reject(approvalTarget.id, reason ?? "");
      upsert(updated);
      setApprovalTarget(null);
      if (approvalMode === "approve") {
        toast.success(`"${name}" approved.`, {
          icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        });
      } else {
        toast.error(`"${name}" rejected.`, {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 6000,
        });
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, `Failed to ${approvalMode} template.`), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setApprovalActing(false);
    }
  }

  // ── Derived: approval queue ──
  const filteredApprovals = React.useMemo(() => {
    let result = templates.filter((t) => {
      const q = aprSearch.toLowerCase();
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.creatorName?.toLowerCase().includes(q) ?? false);
      const matchStatus =
        aprStatusFilter === "all" || t.status === aprStatusFilter;
      return matchSearch && matchStatus;
    });
    if (aprSort) {
      result = [...result].sort((a, b) => {
        const av = String(a[aprSort as keyof ApiTemplate] ?? "");
        const bv = String(b[aprSort as keyof ApiTemplate] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return aprDir === "asc" ? cmp : -cmp;
      });
    }
    return result;
  }, [templates, aprSearch, aprStatusFilter, aprSort, aprDir]);

  const approvalPag = usePagination(filteredApprovals.length);

  React.useEffect(() => {
    approvalPag.reset();
  }, [aprSearch, aprStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const pagedApprovals = filteredApprovals.slice(
    approvalPag.pageStart,
    approvalPag.pageStart + approvalPag.rowsPerPage,
  );
  const approvalPlaceholders = approvalPag.rowsPerPage - pagedApprovals.length;

  function handleApprovalSort(field: ApprovalSortField) {
    if (aprSort === field) setAprDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setAprSort(field);
      setAprDir("asc");
    }
  }

  const aprSortProps = {
    sortField: aprSort,
    sortDir: aprDir,
    onSort: handleApprovalSort,
  };
  const pendingCount = templates.filter((t) => t.status === "DRAFT").length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <TypographyH3>Template Management</TypographyH3>
          <TypographyMuted>
            Create, edit, deactivate, and approve message templates.
          </TypographyMuted>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-guide="template-new">
          <Plus />
          Create Template
        </Button>
      </div>

      <Separator />

      <Tabs defaultValue="templates">
        <TabsList data-guide="template-tabs">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          {(user?.role === "DEPT_HEAD" || user?.role === "SUPER_ADMIN") && (
            <TabsTrigger value="approval" className="gap-2">
              Approval Queue
              {pendingCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Templates Tab ── */}
        <TabsContent value="templates" className="mt-6">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
              No templates yet. Create one to get started.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {templates.map((template) => {
                const isApproved = template.status === "APPROVED";
                const isRetiredOrRejected =
                  template.status === "RETIRED" ||
                  template.status === "REJECTED";
                return (
                  <Card
                    key={template.id}
                    className={cn("flex flex-col", !isApproved && "opacity-80")}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {template.name}
                        <StatusBadge status={template.status} />
                      </CardTitle>
                      <CardDescription>
                        Preview of message (Contacts view)
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <div className="rounded-lg border bg-accent/40 p-3 space-y-2 text-sm">
                        <p className="text-xs font-medium text-muted-foreground">
                          FROM: {template.sender ?? DEFAULT_SENDER}
                        </p>
                        <p className="leading-relaxed">
                          {resolvePreviewNodes(
                            template.body,
                            template.recipients.length > 0
                              ? sampleFromTemplateRecipient(
                                  template.recipients[0].phoneE164,
                                  template.recipients[0].name,
                                  template.variables,
                                )
                              : sampleFromHeaders(template.variables),
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setPreviewTarget(template)}
                      >
                        <Users className="size-3.5" />
                        {templateRecipientCount(template, groups).toLocaleString()}{" "}
                        recipient
                        {templateRecipientCount(template, groups) === 1 ? "" : "s"}
                        {template.recipientGroupId && (
                          <span className="text-muted-foreground/70">
                            (group)
                          </span>
                        )}
                      </button>
                    </CardContent>
                    <div className="flex justify-end items-end">
                      <CardFooter className="max-w-1/2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setEditKey((k) => k + 1);
                            setEditTarget(template);
                          }}
                        >
                          <SquarePen />
                          Edit
                        </Button>
                        {isRetiredOrRejected ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-green-700 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
                            onClick={() => setReactivateTarget(template)}
                          >
                            <CheckCircle2 />
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-destructive hover:text-destructive"
                            disabled={!isApproved}
                            title={
                              isApproved
                                ? undefined
                                : "Only approved templates can be deactivated"
                            }
                            onClick={() => setRetireTarget(template)}
                          >
                            <Ban />
                            Deactivate
                          </Button>
                        )}
                      </CardFooter>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Approval Queue Tab ── */}
        <TabsContent value="approval" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by name or creator..."
                value={aprSearch}
                onChange={(e) => setAprSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select
              value={aprStatusFilter}
              onValueChange={(v) => v !== null && setAprStatusFilter(v)}
            >
              <SelectTrigger className="min-w-36">
                <span className="flex-1 text-sm text-left">
                  {aprStatusFilter === "all"
                    ? "All Statuses"
                    : (STATUS_DISPLAY[aprStatusFilter]?.label ??
                      aprStatusFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="RETIRED">Retired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table pagination={approvalPag.bar}>
            <TableHeader>
              <TableRow>
                <SortableHead
                  field="name"
                  {...aprSortProps}
                  className="pl-4 w-56"
                >
                  Template Name
                </SortableHead>
                <TableHead>Message Body</TableHead>
                <TableHead>Recipients</TableHead>
                <SortableHead field="encoding" {...aprSortProps}>
                  Encoding
                </SortableHead>
                <SortableHead field="creatorName" {...aprSortProps}>
                  Created By
                </SortableHead>
                <SortableHead field="createdAt" {...aprSortProps}>
                  Submitted
                </SortableHead>
                <SortableHead field="status" {...aprSortProps}>
                  Status
                </SortableHead>
                <TableHead className="w-44 text-left">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody
              key={approvalPag.pageKey}
              className="animate-in fade-in duration-200"
            >
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-12 text-center text-muted-foreground"
                  >
                    Loading templates...
                  </TableCell>
                </TableRow>
              ) : pagedApprovals.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-12 text-muted-foreground"
                  >
                    No templates found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {pagedApprovals.map((tpl) => {
                    return (
                      <TableRow key={tpl.id}>
                        <TableCell className="pl-4 font-medium max-w-56">
                          <span className="block truncate">{tpl.name}</span>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <span className="block truncate text-xs text-muted-foreground">
                            {tpl.body}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {templateRecipientCount(tpl, groups).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">
                            {tpl.encoding ?? "GSM7"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {tpl.creatorName ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                          {formatDate(tpl.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={tpl.status} />
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              onClick={() => setPreviewTarget(tpl)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            {tpl.status === "DRAFT" ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50 dark:text-green-400 dark:border-green-900 dark:hover:bg-green-900/20"
                                  onClick={() => {
                                    setApprovalMode("approve");
                                    setApprovalTarget(tpl);
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
                                    setApprovalTarget(tpl);
                                  }}
                                >
                                  <XCircle className="size-3" />
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground italic pl-1">
                                {STATUS_DISPLAY[tpl.status]?.label ??
                                  tpl.status}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {Array.from({ length: approvalPlaceholders }).map((_, i) => (
                    <TableRow
                      key={`ph-${i}`}
                      className="pointer-events-none border-b-0 hover:bg-transparent"
                    >
                      <TableCell colSpan={8} className="p-0 h-10" />
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <TemplateFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        groups={groups}
        saving={saving}
        onSave={handleCreate}
      />

      {/* Edit Dialog */}
      <TemplateFormDialog
        key={editKey}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        mode="edit"
        initialTemplate={editTarget ?? undefined}
        groups={groups}
        saving={saving}
        onSave={handleEdit}
      />

      {/* Deactivate Confirm Dialog */}
      <Dialog
        open={!!retireTarget}
        onOpenChange={(open) => !open && setRetireTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate &ldquo;{retireTarget?.name}
              &rdquo;? It will no longer be available for campaigns.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRetire}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Confirm Dialog */}
      <ConfirmDialog
        open={!!reactivateTarget}
        onOpenChange={(open) => !open && setReactivateTarget(null)}
        title="Reactivate Template?"
        description={`"${reactivateTarget?.name ?? ""}" will return to draft and become usable again in new campaigns and reminders once re-approved.`}
        destructive={false}
        confirmLabel="Reactivate"
        acting={reactivating}
        actingLabel="Reactivating..."
        onConfirm={handleReactivate}
      />

      {/* Approve/Reject Dialog */}
      <ApproveRejectDialog
        open={!!approvalTarget}
        onOpenChange={(open) => !open && setApprovalTarget(null)}
        template={approvalTarget}
        mode={approvalMode}
        acting={approvalActing}
        onConfirm={handleApprovalConfirm}
      />

      {/* Preview Dialog */}
      <TemplatePreviewDialog
        open={!!previewTarget}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
        template={previewTarget}
        groups={groups}
      />
    </div>
  );
}
