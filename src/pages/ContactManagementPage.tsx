"use client";

import * as React from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileDown,
  SquarePen,
  Plus,
  Search,
  Power,
  PowerOff,
  Users,
  XCircle,
  UploadCloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { IndividualContactsDialog } from "@/components/contacts/individual-contacts-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { TypographyMuted } from "@/components/ui/typography";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/tablePagination";

import {
  groupsApi,
  apiErrorMessage,
  summarizeUpload,
  isValidEthiopianE164,
  type ApiGroup,
  type ApiUploadHistory,
  type GroupMember,
} from "@/lib/services";
import { ColumnMapDialog } from "@/components/ui/column-map-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ─── Types ───────────────────────────────────────────────────────────────

type SortField =
  | "groupname"
  | "filename"
  | "records"
  | "uploadedby"
  | "uploadeddate";

type SortDir = "asc" | "desc";
type StatusFilter = "All Statuses" | "Active" | "Inactive";

interface ContactGroup {
  id: string;
  groupname: string;
  description: string;
  filename: string;
  records: string;
  uploadedby: string;
  uploadeddate: string;
  status?: "Active" | "Inactive";
  /** null = not yet computed (fetched separately, after the group list loads). */
  badPhoneCount: number | null;
}

// ─── Backend mapping ─────────────────────────────────────────────────────

function fromApi(g: ApiGroup): ContactGroup {
  // memberCount is a live COUNT(*) over the group's current members — always
  // correct. recordCount is just the *last upload's* importedCount, which can
  // read 0 (or otherwise diverge) e.g. when the latest upload only contained
  // duplicates of existing members: those get linked to the group without
  // counting as "imported". Campaign/Template pickers already read
  // memberCount directly, which is why they showed the real number while this
  // table showed 0 for the same group.
  const count = g.memberCount ?? g.recordCount ?? 0;
  return {
    id: g.id,
    groupname: g.name,
    description: g.description ?? "",
    filename: g.originalFileName ?? "—",
    records: count.toLocaleString(),
    uploadedby: g.uploadedByName ?? "—",
    uploadeddate: g.uploadDate ? g.uploadDate.slice(0, 10) : "—",
    status: g.status === "ACTIVE" ? "Active" : "Inactive",
    badPhoneCount: null,
  };
}

/**
 * "Empty or wrong phone numbers" for a group, combining two sources the
 * backend never merges itself: rows the last upload rejected outright
 * (almost always an empty phone cell — see ExcelUploadService), plus
 * currently-saved members whose phoneE164 isn't a well-formed Ethiopian
 * number (the classic case: Excel stored the phone column as a Number and
 * silently dropped the leading 0, so the row still imports, just malformed).
 */
async function countBadPhones(groupId: string): Promise<number> {
  const [members, history] = await Promise.all([
    groupsApi.listMembers(groupId).catch((): GroupMember[] => []),
    groupsApi.uploadHistory(groupId).catch((): ApiUploadHistory[] => []),
  ]);
  const malformed = members.filter((m) => !isValidEthiopianE164(m.phoneE164)).length;
  const rejected = history[0]?.errorCount ?? 0;
  return malformed + rejected;
}

// ─── Recipients Dialog ────────────────────────────────────────────────────

function GroupRecipientsDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ContactGroup | null;
}) {
  const [recipientSearch, setRecipientSearch] = React.useState("");
  const [members, setMembers] = React.useState<GroupMember[]>([]);
  const [loadingRecipients, setLoadingRecipients] = React.useState(false);

  React.useEffect(() => {
    if (!open || !group) {
      setMembers([]);
      setRecipientSearch("");
      return;
    }
    setLoadingRecipients(true);
    groupsApi
      .listMembers(group.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoadingRecipients(false));
  }, [open, group]);

  if (!group) return null;

  const recipients = members.map((m) => ({
    phone: m.phoneE164 ?? m.phone ?? "",
    name: m.name,
  }));

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
          <DialogTitle>{group.groupname}</DialogTitle>
          <DialogDescription>
            {loadingRecipients ? "Loading recipients…" : `${recipients.length.toLocaleString()} recipient${recipients.length === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {loadingRecipients ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <TypographyMuted className="text-sm italic">
              No recipients found for this group.
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
              <ScrollArea className="h-72 rounded-md border">
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

// ─── Header parsing helper ────────────────────────────────────────────────

/**
 * CSVs are decoded as UTF-8 text first: handing SheetJS the raw bytes makes
 * it read them as Latin-1, garbling Amharic header names in the column
 * picker. (Excel files still go through the binary path.)
 */
function readAsWorkbook(buf: ArrayBuffer, fileName: string): XLSX.WorkBook {
  if (/\.(csv|txt)$/i.test(fileName)) {
    const text = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
    if (!text.includes("\uFFFD")) {
      return XLSX.read(text, { type: "string", raw: true });
    }
  }
  return XLSX.read(buf, { type: "array" });
}

function parseFileHeadersClient(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = readAsWorkbook(e.target?.result as ArrayBuffer, file.name);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
        if (rows.length > 0) {
          resolve(
            (rows[0] as unknown as string[])
              .map((h) => String(h).trim())
              .filter(Boolean),
          );
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

// ─── Sortable Head ────────────────────────────────────────────────────────

function SortableHead({
  children,
  field,
  onSort,
  className,
}: {
  children: React.ReactNode;
  field: SortField;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-left"
      >
        {children}
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
      </button>
    </TableHead>
  );
}

// ─── Component ────────────────────────────────────────────────────────────

export default function ContactGroupsPage() {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<StatusFilter>("All Statuses");
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
  const [editUploadedFile, setEditUploadedFile] = React.useState<File | null>(
    null,
  );
  const [groups, setGroups] = React.useState<ContactGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [groupName, setGroupName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [editGroupName, setEditGroupName] = React.useState("");
  const [editDescription, setEditDescription] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [contactsDialogOpen, setContactsDialogOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [pageKey, setPageKey] = React.useState(0);

  // Column map dialog state
  const [colMapPending, setColMapPending] = React.useState<{ file: File; headers: string[]; target: "create" | "edit" } | null>(null);

  // Recipients preview dialog state
  const [recipientsTarget, setRecipientsTarget] = React.useState<ContactGroup | null>(null);

  // Activate-group confirmation target (one dialog serves the whole table).
  const [activateTarget, setActivateTarget] = React.useState<ContactGroup | null>(null);

  const loadGroups = React.useCallback(() => {
    setLoading(true);
    groupsApi
      .list()
      .then((data) => {
        const mapped = data.map(fromApi);
        setGroups(mapped);
        // Fetched per-group, after the list paints, since it requires the
        // member list + upload history and shouldn't block the table.
        mapped.forEach((g) => {
          countBadPhones(g.id).then((badPhoneCount) => {
            setGroups((prev) =>
              prev.map((row) => (row.id === g.id ? { ...row, badPhoneCount } : row)),
            );
          });
        });
      })
      .catch((e) => {
        toast.error(apiErrorMessage(e, "Failed to load contact groups."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const filteredData = React.useMemo(() => {
    let result = groups.filter((item) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        item.groupname.toLowerCase().includes(q) ||
        item.filename.toLowerCase().includes(q) ||
        item.uploadedby.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "All Statuses" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        const av = String(a[sortField] ?? "");
        const bv = String(b[sortField] ?? "");
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [groups, search, statusFilter, sortField, sortDir]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, rowsPerPage, groups]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * rowsPerPage;
  const paged = filteredData.slice(pageStart, pageStart + rowsPerPage);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage) return;
    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }

  async function handleFileSelect(file: File, target: "create" | "edit") {
    const headers = await parseFileHeadersClient(file);
    setColMapPending({ file, headers, target });
  }

  function handleColMapConfirm(_phoneCol: string) {
    if (!colMapPending) return;
    const { file, target } = colMapPending;
    setColMapPending(null);
    if (target === "create") {
      setUploadedFile(file);
      toast.success(`${file.name} selected`);
    } else {
      setEditUploadedFile(file);
      toast.success(`${file.name} selected`);
    }
  }

  async function handleCreateGroup() {
    if (!groupName.trim() || !uploadedFile) {
      toast.error("Please enter a group name and upload a contact list.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
      return;
    }

    setSubmitting(true);
    let createdId: string | null = null;
    try {
      const created = await groupsApi.create({
        name: groupName.trim(),
        description: description.trim() || undefined,
      });
      createdId = created.id;
      const upload = await groupsApi.uploadToGroup(created.id, uploadedFile);

      const summary = summarizeUpload(upload);
      if (summary.hasIssues) {
        toast.warning(`Group created — ${summary.title}`, {
          description: summary.description,
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 10000,
        });
      } else {
        toast.success(`Group created — ${summary.title}`, {
          icon: <UploadCloud className="size-4" strokeWidth={2.5} />,
        });
      }
      setGroupName("");
      setDescription("");
      setUploadedFile(null);
      setCreateOpen(false);
      loadGroups();
    } catch (e) {
      if (createdId) {
        try {
          await groupsApi.deactivate(createdId);
        } catch {
          /* best effort */
        }
      }
      toast.error(apiErrorMessage(e, "Failed to create the contact group."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenEdit(item: ContactGroup) {
    if (!item.id || !item.groupname.trim()) {
      toast.error("Unable to load contact group.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }
    setEditingId(item.id);
    setEditGroupName(item.groupname);
    setEditDescription(item.description);
    setEditUploadedFile(null);
  }

  async function handleSaveEdit() {
    if (!editingId || !editGroupName.trim()) {
      toast.error("Please provide a group name.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return;
    }

    setSubmitting(true);
    try {
      await groupsApi.update(editingId, {
        name: editGroupName.trim(),
        description: editDescription.trim(),
      });
      if (editUploadedFile) {
        const upload = await groupsApi.uploadToGroup(editingId, editUploadedFile);
        const summary = summarizeUpload(upload);
        if (summary.hasIssues) {
          toast.warning(`Group updated — ${summary.title}`, {
            description: summary.description,
            icon: <XCircle className="size-4" strokeWidth={2.5} />,
            duration: 10000,
          });
        } else {
          toast.success(`Group updated — ${summary.title}`, {
            icon: <SquarePen className="size-4" strokeWidth={2.5} />,
          });
        }
      } else {
        toast.success("Group updated successfully!", {
          icon: <SquarePen className="size-4" strokeWidth={2.5} />,
        });
      }
      setEditingId(null);
      setEditUploadedFile(null);
      loadGroups();
    } catch (e) {
      toast.error(apiErrorMessage(e, "Failed to update the contact group."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await groupsApi.deactivate(id);
      toast.success("Contact group deactivated.", { duration: 6000 });
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, status: "Inactive" } : g)),
      );
    } catch (e) {
      toast.error(apiErrorMessage(e, "Could not deactivate group."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleActivate(id: string) {
    try {
      await groupsApi.activate(id);
      toast.success("Contact group re-activated successfully!");
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, status: "Active" } : g)),
      );
    } catch (e) {
      toast.error(apiErrorMessage(e, "Could not activate group."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleDownload(item: ContactGroup) {
    try {
      const blob = await groupsApi.exportMembers(item.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const base = item.groupname.replace(/[^\w.-]+/g, "_") || "group_members";
      link.download = `${base}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`${item.groupname} exported successfully!`);
    } catch (e) {
      toast.error(apiErrorMessage(e, "Failed to export the group."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">
        {filteredData.length} result(s)
      </span>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">
          Rows per page
        </span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(value) => {
            setRowsPerPage(Number(value));
            setCurrentPage(1);
            setPageKey((k) => k + 1);
          }}
        >
          <SelectTrigger className="h-8 w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50].map((row) => (
              <SelectItem key={row} value={String(row)}>
                {row}
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

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Contact Groups
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload and manage contact lists for campaigns
        </p>
      </div>
      <Separator />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3" data-guide="contacts-search">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => v !== null && setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Statuses">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => setContactsDialogOpen(true)}
          data-guide="contacts-individual"
        >
          <Users className="size-4" />
          Manage Contacts
        </Button>

        {/* Create Group dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button className="shrink-0" data-guide="contacts-new" />}>
            <Plus className="size-4" />
            Create Group
          </DialogTrigger>

          <DialogContent className="sm:max-w-2xl">
            <DialogHeader guideId="create-group">
              <DialogTitle>Create Contact Group</DialogTitle>
              <DialogDescription>
                Add a new contact group for campaigns.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5" data-guide="cg-name">
                <Label>
                  Group Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Policy Holders Jan 2025"
                />
              </div>

              <div className="space-y-1.5" data-guide="cg-description">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — what this group is for"
                  rows={2}
                />
              </div>

              <div className="space-y-1.5" data-guide="cg-upload">
                <Label>
                  Upload Contact List{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-accent/30 p-6 text-center transition hover:bg-accent/50">
                  <UploadCloud className="mb-3 size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Click to upload or drag and drop
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Excel or CSV files
                  </p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = "";
                      handleFileSelect(file, "create");
                    }}
                  />
                </label>
                {uploadedFile && (
                  <div className="flex items-center justify-between rounded-lg border bg-accent/20 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <UploadCloud className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {uploadedFile.name}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setUploadedFile(null)}
                    >
                      <PowerOff className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button onClick={handleCreateGroup} disabled={submitting}>
                {submitting ? "Creating…" : "Create Group"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Table pagination={pagination}>
        <TableHeader>
          <TableRow>
            <SortableHead
              field="groupname"
              onSort={handleSort}
              className="w-64"
            >
              Group Name
            </SortableHead>
            <SortableHead field="filename" onSort={handleSort} className="w-64">
              File Name
            </SortableHead>
            <SortableHead field="records" onSort={handleSort}>
              Recipients
            </SortableHead>
            <TableHead>Empty/Wrong Phone #s</TableHead>
            <SortableHead field="uploadedby" onSort={handleSort}>
              Uploaded By
            </SortableHead>
            <SortableHead field="uploadeddate" onSort={handleSort}>
              Upload Date
            </SortableHead>
            <TableHead className="w-36 text-left">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody key={pageKey} className="animate-in fade-in duration-200">
          {loading ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-12 text-muted-foreground"
              >
                Loading contact groups…
              </TableCell>
            </TableRow>
          ) : paged.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-12 text-muted-foreground"
              >
                No contact groups found.
              </TableCell>
            </TableRow>
          ) : (
            paged.map((item) => {
              const isInactive = item.status === "Inactive";
              return (
                <TableRow
                  key={item.id}
                  className={
                    isInactive
                      ? "opacity-50 transition-all duration-300"
                      : "transition-all duration-300"
                  }
                >
                  <TableCell className="font-medium">
                    {item.groupname}
                    {isInactive && (
                      <Badge
                        variant="outline"
                        className="ml-2 border-0 bg-neutral-100 text-neutral-500 text-[10px] dark:bg-neutral-800 dark:text-neutral-400"
                      >
                        Deactivated
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="font-mono text-xs">
                    {item.filename}
                  </TableCell>
                  <TableCell>{item.records}</TableCell>
                  <TableCell className="tabular-nums">
                    {item.badPhoneCount === null ? (
                      <span className="text-muted-foreground">…</span>
                    ) : item.badPhoneCount > 0 ? (
                      <span className="font-medium text-destructive">
                        {item.badPhoneCount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {item.uploadedby}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {item.uploadeddate}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* View recipients */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setRecipientsTarget(item)}
                      >
                        <Eye className="size-4" />
                      </Button>

                      {/* Edit */}
                      <Dialog
                        open={editingId === item.id}
                        onOpenChange={(open) =>
                          open ? handleOpenEdit(item) : setEditingId(null)
                        }
                      >
                        <DialogTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" disabled={isInactive} />
                          }
                        >
                          <SquarePen className="size-4" />
                        </DialogTrigger>

                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit Group</DialogTitle>
                            <DialogDescription>
                              Update the group name, description, or file.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <Label>
                                Group Name{" "}
                                <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                value={editGroupName}
                                onChange={(e) =>
                                  setEditGroupName(e.target.value)
                                }
                                placeholder="e.g. Policy Holders Jan 2025"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label>Description</Label>
                              <Textarea
                                value={editDescription}
                                onChange={(e) =>
                                  setEditDescription(e.target.value)
                                }
                                placeholder="Optional — what this group is for"
                                rows={2}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <Label>Upload Contact List (optional)</Label>
                              <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-accent/30 p-6 text-center transition hover:bg-accent/50">
                                <UploadCloud className="mb-3 size-8 text-muted-foreground" />
                                <p className="text-sm font-medium">
                                  Click to upload or drag and drop
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Excel or CSV files
                                </p>
                                <input
                                  type="file"
                                  accept=".xlsx,.xls,.csv"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    e.target.value = "";
                                    handleFileSelect(file, "edit");
                                  }}
                                />
                              </label>
                              {editUploadedFile && (
                                <div className="flex items-center justify-between rounded-lg border bg-accent/20 px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <UploadCloud className="size-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">
                                      {editUploadedFile.name}
                                    </span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setEditUploadedFile(null)}
                                  >
                                    <PowerOff className="size-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>

                          <DialogFooter>
                            <DialogClose render={<Button variant="outline" />}>
                              Cancel
                            </DialogClose>
                            <Button
                              onClick={handleSaveEdit}
                              disabled={submitting}
                            >
                              {submitting ? "Saving…" : "Save Changes"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      {/* Download */}
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" disabled={isInactive} />
                          }
                        >
                          <FileDown className="size-4" />
                        </DialogTrigger>

                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Download File</DialogTitle>
                            <DialogDescription>
                              Review the details before downloading.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Group Name
                              </p>
                              <p className="font-semibold">{item.groupname}</p>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                File Name
                              </p>
                              <p className="font-mono text-xs">
                                {item.filename}
                              </p>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Recipients
                              </p>
                              <p className="font-semibold">{item.records}</p>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Uploaded By
                              </p>
                              <p className="font-semibold">{item.uploadedby}</p>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                Upload Date
                              </p>
                              <p className="font-semibold">
                                {item.uploadeddate}
                              </p>
                            </div>
                          </div>

                          <DialogFooter>
                            <DialogClose render={<Button variant="outline" />}>
                              Cancel
                            </DialogClose>
                            <DialogClose render={<Button onClick={() => handleDownload(item)} />}>
                              <FileDown className="size-4" />
                              Download
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      {/* Activate / Deactivate */}
                      {isInactive ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-green-600 hover:text-green-600 dark:text-green-400"
                          onClick={() => setActivateTarget(item)}
                        >
                          <Power className="size-4" />
                        </Button>
                      ) : (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                            />
                          }
                        >
                          <PowerOff className="size-4" />
                        </DialogTrigger>

                        <DialogContent className="sm:max-w-sm">
                          <DialogHeader>
                            <DialogTitle className="text-destructive">
                              Deactivate Group Link
                            </DialogTitle>
                            <DialogDescription>
                              Are you sure you want to deactivate{" "}
                              <span className="font-semibold text-foreground">
                                &ldquo;{item.groupname}&rdquo;
                              </span>
                              ?
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <DialogClose render={<Button variant="outline" />}>
                              Cancel
                            </DialogClose>
                            <DialogClose
                              render={
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDeactivate(item.id)}
                                />
                              }
                            >
                              Deactivate Group
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Column Map Dialog */}
      <ColumnMapDialog
        open={!!colMapPending}
        headers={colMapPending?.headers ?? []}
        fileName={colMapPending?.file.name ?? ""}
        requireDateCol={false}
        onConfirm={handleColMapConfirm}
        onCancel={() => setColMapPending(null)}
      />

      {/* Recipients Dialog */}
      <GroupRecipientsDialog
        open={!!recipientsTarget}
        onOpenChange={(open) => !open && setRecipientsTarget(null)}
        group={recipientsTarget}
      />

      {/* Activate confirmation — reactivating makes the group selectable for
          sends again, so confirm first. One dialog serves the whole table. */}
      <ConfirmDialog
        open={!!activateTarget}
        onOpenChange={(next) => !next && setActivateTarget(null)}
        title="Activate Contact Group?"
        description={
          activateTarget
            ? `"${activateTarget.groupname}" will be selectable for campaigns, templates, and reminders again.`
            : ""
        }
        confirmLabel="Activate"
        onConfirm={() => {
          const target = activateTarget;
          setActivateTarget(null);
          if (target) handleActivate(target.id);
        }}
      />

      {/* Individual Contacts management */}
      <IndividualContactsDialog
        open={contactsDialogOpen}
        onOpenChange={setContactsDialogOpen}
      />
    </div>
  );
}
