"use client";

import * as React from "react";

import {
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  GitBranch,
  Power,
  PowerOff,
  Search,
  SquarePen,
  XCircle,
  CheckCircle2,
} from "lucide-react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

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

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/tablePagination";

import {
  apiErrorMessage,
  usersApi,
  workspacesApi,
  type ApiUser,
  type ApiWorkspace,
  type ApiWorkspaceMember,
} from "@/lib/services";
import {
  ALL_WORKSPACE_PERMISSION_CODES,
  WORKSPACE_PERMISSIONS_LEFT,
  WORKSPACE_PERMISSIONS_RIGHT,
} from "@/lib/workspace-permissions";

type SortField = "name" | "admin" | "users" | "status";
type SortDir = "asc" | "desc";

interface WorkspaceRow {
  ws: ApiWorkspace;
  admin: string;
  users: number;
}

function SortableHead({
  children,
  field,
  onSort,
}: {
  children: React.ReactNode;
  field: SortField;
  onSort: (field: SortField) => void;
}) {
  return (
    <TableHead>
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

export default function DepartmentTable({ refreshKey = 0 }: { refreshKey?: number }) {
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [rows, setRows] = React.useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Edit dialog state
  const [editOpenForId, setEditOpenForId] = React.useState<string | null>(null);
  const [editSaving, setEditSaving] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  const [editAdmin, setEditAdmin] = React.useState("");
  const [editDelegate, setEditDelegate] = React.useState("");
  const [editDailyLimit, setEditDailyLimit] = React.useState("");
  const [editCheckedPerms, setEditCheckedPerms] = React.useState<Set<string>>(new Set());
  const [editDelegationEnabled, setEditDelegationEnabled] = React.useState(false);
  const [adminOptions, setAdminOptions] = React.useState<ApiUser[]>([]);

  // View dialog state
  const [viewTarget, setViewTarget] = React.useState<WorkspaceRow | null>(null);
  const [viewWs, setViewWs] = React.useState<ApiWorkspace | null>(null);
  const [viewMembers, setViewMembers] = React.useState<ApiWorkspaceMember[]>([]);
  const [viewLoading, setViewLoading] = React.useState(false);

  React.useEffect(() => {
    if (!viewTarget) { setViewWs(null); setViewMembers([]); return; }
    setViewLoading(true);
    setViewWs(viewTarget.ws);
    Promise.all([
      workspacesApi.get(viewTarget.ws.id).then(setViewWs).catch(() => {}),
      workspacesApi.members(viewTarget.ws.id).then(setViewMembers).catch(() => setViewMembers([])),
    ]).finally(() => setViewLoading(false));
  }, [viewTarget]);

  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const [pageKey, setPageKey] = React.useState(0);

  // Toolbar: search + filters
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "ACTIVE" | "SUSPENDED">("all");
  const [typeFilter, setTypeFilter] = React.useState<"all" | "standalone" | "umbrella" | "branch">("all");

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, typeFilter]);

  React.useEffect(() => {
    let cancelled = false;
    // The list response is enriched with adminName, adminUserId and memberCount,
    // so the admin + user count are read directly — no per-workspace member call.
    workspacesApi
      .list()
      .then((workspaces) => {
        if (cancelled) return;
        setRows(
          workspaces.map((ws) => ({
            ws,
            admin: ws.adminName ?? "—",
            users: ws.memberCount,
          })),
        );
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(apiErrorMessage(err, "Failed to load workspaces."), {
            icon: <XCircle className="size-4" strokeWidth={2.5} />,
            duration: 7000,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // Active users populate the "Assign Workspace Admin" select in the edit dialog
    usersApi
      .list("ACTIVE")
      .then((data) => {
        if (!cancelled) setAdminOptions(data);
      })
      .catch(() => {
        /* select falls back to showing the current admin only */
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function toggleEditPerm(code: string) {
    setEditCheckedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchSearch =
        !q ||
        r.ws.name.toLowerCase().includes(q) ||
        r.ws.code.toLowerCase().includes(q) ||
        r.admin.toLowerCase().includes(q);
      const matchStatus = statusFilter === "all" || r.ws.status === statusFilter;
      const matchType =
        typeFilter === "all" ||
        (typeFilter === "umbrella" && r.ws.isBranchParent) ||
        (typeFilter === "branch" && !!r.ws.parentWorkspaceId) ||
        (typeFilter === "standalone" && !r.ws.isBranchParent && !r.ws.parentWorkspaceId);
      return matchSearch && matchStatus && matchType;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const sortedData = React.useMemo(() => {
    if (!sortField) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const pick = (r: WorkspaceRow) =>
        sortField === "name"
          ? r.ws.name
          : sortField === "status"
            ? r.ws.status
            : r[sortField];
      const av = pick(a);
      const bv = pick(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * rowsPerPage;
  const paginated = sortedData.slice(start, start + rowsPerPage);

  function goToPage(page: number) {
    const next = Math.max(1, Math.min(totalPages, page));
    if (next === safePage) return;
    setCurrentPage(next);
    setPageKey((k) => k + 1);
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function patchRow(updated: ApiWorkspace) {
    setRows((prev) =>
      prev.map((r) =>
        r.ws.id === updated.id
          ? {
              ws: updated,
              admin: updated.adminName ?? "—",
              users: updated.memberCount,
            }
          : r,
      ),
    );
  }

  async function handleEditWorkspace(row: WorkspaceRow): Promise<boolean> {
    if (!editName.trim()) {
      toast.error("Workspace name is required.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
      return false;
    }

    if (editDelegationEnabled && !editDelegate) {
      toast.error("Please assign a delegate for the sign-off permission.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
      return false;
    }

    // Preserve permission codes this UI doesn't know about (excluding DELEGATION — managed separately)
    const unknownPerms = row.ws.permissions.filter(
      (p) => !ALL_WORKSPACE_PERMISSION_CODES.includes(p) && p !== "DELEGATION",
    );
    const dailyLimit = Number(editDailyLimit);
    // Reassign the workspace admin (DEPT_HEAD) only when the selection changed
    const adminChanged = editAdmin && editAdmin !== (row.ws.adminUserId ?? "");
    const delegateChanged = editDelegate !== (row.ws.delegateUserId ?? "");

    const permissions = [
      ...editCheckedPerms,
      ...unknownPerms,
      ...(editDelegationEnabled ? ["DELEGATION"] : []),
    ];

    setEditSaving(true);
    try {
      const updated = await workspacesApi.update(row.ws.id, {
        name: editName.trim(),
        ...(!row.ws.parentWorkspaceId && editDailyLimit.trim() && Number.isInteger(dailyLimit)
          ? { dailySmsLimit: dailyLimit }
          : {}),
        permissions,
        ...(adminChanged ? { adminUserId: editAdmin } : {}),
        ...(editDelegationEnabled && delegateChanged ? { delegateUserId: editDelegate } : {}),
      });
      patchRow(updated);
      toast.success(`"${editName.trim()}" updated successfully!`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update workspace."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
      return false;
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDeactivateWorkspace(row: WorkspaceRow) {
    try {
      const updated = await workspacesApi.deactivate(row.ws.id);
      patchRow(updated);
      toast.success(`"${row.ws.name}" deactivated. Its members are locked out until reactivated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to deactivate workspace."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  async function handleActivateWorkspace(row: WorkspaceRow) {
    try {
      const updated = await workspacesApi.activate(row.ws.id);
      patchRow(updated);
      toast.success(`"${row.ws.name}" re-activated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to activate workspace."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">{sortedData.length} result(s)</span>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">Rows per page</span>
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
            {[5, 10, 20].map((n) => (
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
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(1)} disabled={safePage === 1}>
          <ChevronsLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(safePage - 1)} disabled={safePage === 1}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(safePage + 1)} disabled={safePage === totalPages}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => goToPage(totalPages)} disabled={safePage === totalPages}>
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name, code, or admin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v as typeof typeFilter)}>
          <SelectTrigger className="min-w-40">
            <span className="flex-1 text-sm text-left">
              {typeFilter === "all"
                ? "All Types"
                : typeFilter === "umbrella"
                  ? "Branch-workspaces"
                  : typeFilter === "branch"
                    ? "Branches"
                    : "Standalone"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="standalone">Standalone</SelectItem>
            <SelectItem value="umbrella">Branch-workspaces</SelectItem>
            <SelectItem value="branch">Branches</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="min-w-35">
            <span className="flex-1 text-sm text-left">
              {statusFilter === "all" ? "All Statuses" : statusFilter === "ACTIVE" ? "Active" : "Suspended"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Table pagination={pagination}>
        <TableHeader>
          <TableRow>
            <SortableHead field="name" onSort={handleSort}>
              Workspace
            </SortableHead>
            <SortableHead field="admin" onSort={handleSort}>
              Admin
            </SortableHead>
            <SortableHead field="users" onSort={handleSort}>
              Users
            </SortableHead>
            <SortableHead field="status" onSort={handleSort}>
              Status
            </SortableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody key={pageKey} className="animate-in fade-in duration-200">
          {paginated.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                {loading
                  ? "Loading workspaces..."
                  : rows.length > 0
                    ? "No workspaces match your search or filters."
                    : "No workspaces found."}
              </TableCell>
            </TableRow>
          ) : (
            paginated.map((row) => {
              const item = row.ws;
              const isActive = item.status === "ACTIVE";
              // value→label maps for the Base UI selects (without these,
              // <SelectValue> shows the raw UUID instead of the user's name).
              // The orphan entry covers an admin/delegate who isn't in the
              // active-users list (e.g. a now-disabled user).
              //
              // A user can only belong to one workspace, but the backend
              // only rejects that on POST /workspaces/{id}/members — a
              // reassignment via this edit dialog's adminUserId silently
              // succeeds server-side even if the pick already belongs
              // elsewhere. Filter those out of the admin picker so the
              // violation can't be created here (a user already assigned as
              // *this* workspace's admin stays selectable, since that's a
              // no-op reassignment, not a new violation).
              const eligibleAdminOptions = adminOptions.filter(
                (u) => u.id === item.adminUserId || u.memberships.length === 0,
              );
              const userItems = eligibleAdminOptions.map((u) => ({
                value: u.id,
                label: `${u.displayName} (${u.username})`,
              }));
              const adminItems =
                editAdmin && !eligibleAdminOptions.some((u) => u.id === editAdmin)
                  ? [{ value: editAdmin, label: item.adminName ?? editAdmin }, ...userItems]
                  : userItems;
              // A delegate must be an unassigned user or an existing member of
              // THIS workspace who isn't its head — never someone pulled from
              // another workspace (single membership), and never the head. The
              // current delegate stays selectable so re-saving is a no-op.
              const delegateEligible = adminOptions.filter((u) => {
                if (u.id === item.delegateUserId) return true;
                const inThisWs = u.memberships.some((m) => m.workspaceId === item.id);
                const inOtherWs = u.memberships.some((m) => m.workspaceId !== item.id);
                if (inOtherWs) return false;
                if (u.id === item.adminUserId) return false;
                return inThisWs || u.memberships.length === 0;
              });
              const delegateUserItems = delegateEligible.map((u) => ({
                value: u.id,
                label: u.memberships.some((m) => m.workspaceId === item.id)
                  ? `${u.displayName} (${u.username}) — member here`
                  : `${u.displayName} (${u.username})`,
              }));
              const delegateItems =
                editDelegate && !delegateEligible.some((u) => u.id === editDelegate)
                  ? [{ value: editDelegate, label: item.delegateName ?? editDelegate }, ...delegateUserItems]
                  : delegateUserItems;
              return (
              <TableRow
                key={item.id}
                className="cursor-pointer"
                onClick={() => setViewTarget(row)}
              >
                <TableCell>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.isBranchParent && (
                        <Badge variant="outline" className="border-0 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 text-[10px] px-1.5 py-0 gap-1">
                          <Building2 className="size-2.5" />
                          {item.branchCount} branch{item.branchCount === 1 ? "" : "es"}
                        </Badge>
                      )}
                      {item.parentWorkspaceId && (
                        <Badge variant="outline" className="border-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 text-[10px] px-1.5 py-0 gap-1">
                          <GitBranch className="size-2.5" />
                          {item.parentName ?? "Branch"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{item.code}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{row.admin}</TableCell>
                <TableCell>{row.users}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      isActive
                        ? "border-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                        : "border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                    }
                  >
                    {isActive ? "Active" : "Suspended"}
                  </Badge>
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-2">
                    {/* View */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setViewTarget(row)}
                    >
                      <Eye className="size-4" />
                    </Button>

                    {/* Edit */}
                    <Dialog
                      open={editOpenForId === item.id}
                      onOpenChange={(open) => { if (!open) setEditOpenForId(null); }}
                    >
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditName(item.name);
                          setEditAdmin(item.adminUserId ?? "");
                          setEditDelegate(item.delegateUserId ?? "");
                          setEditDailyLimit(
                            item.dailySmsLimit != null ? String(item.dailySmsLimit) : "",
                          );
                          setEditDelegationEnabled(item.permissions.includes("DELEGATION"));
                          setEditCheckedPerms(
                            new Set(
                              item.permissions.filter((p) =>
                                ALL_WORKSPACE_PERMISSION_CODES.includes(p),
                              ),
                            ),
                          );
                          setEditOpenForId(item.id);
                        }}
                      >
                        <SquarePen className="size-4" />
                      </Button>

                      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader guideId="workspace-edit">
                          <DialogTitle>Edit Workspace</DialogTitle>
                          <DialogDescription>
                            Make changes to the workspace here.
                          </DialogDescription>
                        </DialogHeader>

                        <ScrollArea className="-mx-4 no-scrollbar max-h-[65vh] overflow-y-auto px-4">
                        <div className="space-y-4">
                          {/* Row 1: Name + Code */}
                          <div className="grid gap-4 sm:grid-cols-2" data-guide="we-basics">
                            <div className="space-y-1.5">
                              <Label>
                                Workspace Name <span className="text-destructive">*</span>
                              </Label>
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-muted-foreground">Workspace Code</Label>
                              <Input
                                value={item.code}
                                disabled
                                className="opacity-60"
                              />
                              <p className="text-xs text-muted-foreground">
                                Code cannot be changed after creation.
                              </p>
                            </div>
                          </div>

                          {/* Row 2: Admin — an umbrella holds no members/data of
                              its own, so it has no admin to reassign. */}
                          {!item.isBranchParent && (
                            <div className="space-y-1.5">
                              <Label>
                                Assign Workspace Admin <span className="text-destructive">*</span>
                              </Label>
                              <SearchableSelect
                                items={adminItems.map((it) => ({ ...it, keywords: it.label }))}
                                value={editAdmin}
                                onValueChange={setEditAdmin}
                                placeholder="Select user"
                                searchPlaceholder="Search users by name or username…"
                                emptyText="No eligible users available."
                              />
                              <p className="text-xs text-muted-foreground">
                                Reassigns the workspace&apos;s Department Head. A user
                                can only belong to one workspace, so users already in
                                another one aren&apos;t shown here.
                              </p>
                            </div>
                          )}

                          {/* Row 3: Daily SMS limit — a branch has no limit of
                              its own; it's set once on the umbrella. */}
                          {!item.parentWorkspaceId && (
                            <div className="space-y-1.5" data-guide="we-limits">
                              <Label>Daily SMS Limit (optional)</Label>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g. 5000"
                                value={editDailyLimit}
                                onChange={(e) => setEditDailyLimit(e.target.value)}
                              />
                              {item.isBranchParent && (
                                <p className="text-xs text-muted-foreground">
                                  Applies to this branch-workspace and every branch under
                                  it — branches don&apos;t have their own limit.
                                </p>
                              )}
                            </div>
                          )}

                          {/* Permissions — a branch inherits its umbrella's
                              permissions and can't have its own. */}
                          {!item.parentWorkspaceId && (
                            <>
                              <Separator />
                              <div data-guide="we-perms">
                                <p className="font-semibold text-sm">Workspace Permissions</p>
                                <p className="text-xs text-muted-foreground">
                                  Configure what this workspace can do.
                                </p>
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-3">
                                  {WORKSPACE_PERMISSIONS_LEFT.map((perm) => (
                                    <div key={perm.code} className="flex items-start gap-3">
                                      <Checkbox
                                        id={`edit-${perm.code}`}
                                        checked={editCheckedPerms.has(perm.code)}
                                        onCheckedChange={() => toggleEditPerm(perm.code)}
                                        className="mt-0.5 shrink-0"
                                      />
                                      <div>
                                        <Label htmlFor={`edit-${perm.code}`} className="text-sm cursor-pointer">
                                          {perm.title}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">{perm.desc}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-3">
                                  {WORKSPACE_PERMISSIONS_RIGHT.map((perm) => (
                                    <div key={perm.code} className="flex items-start gap-3">
                                      <Checkbox
                                        id={`edit-${perm.code}`}
                                        checked={editCheckedPerms.has(perm.code)}
                                        onCheckedChange={() => toggleEditPerm(perm.code)}
                                        className="mt-0.5 shrink-0"
                                      />
                                      <div>
                                        <Label htmlFor={`edit-${perm.code}`} className="text-sm cursor-pointer">
                                          {perm.title}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">{perm.desc}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          {/* Delegation — never available to a branch-workspace
                              (umbrella) or a branch, only a standalone workspace. */}
                          {!item.isBranchParent && !item.parentWorkspaceId && (
                            <>
                              <Separator />
                              <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id="edit-delegation"
                                    checked={editDelegationEnabled}
                                    onCheckedChange={(v) => {
                                      setEditDelegationEnabled(Boolean(v));
                                      if (!v) setEditDelegate("");
                                    }}
                                    className="mt-0.5 shrink-0"
                                  />
                                  <div>
                                    <Label htmlFor="edit-delegation" className="text-sm font-semibold cursor-pointer">
                                      Require delegate sign-off
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                      Messages from this workspace must be approved by a delegate before sending.
                                    </p>
                                  </div>
                                </div>

                                {editDelegationEnabled && (
                                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                                    <div>
                                      <p className="text-sm font-semibold">
                                        Assign Delegate{" "}
                                        <span className="text-destructive">*</span>
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        This person will approve messages before they
                                        are sent from this workspace.
                                      </p>
                                    </div>
                                    <SearchableSelect
                                      items={delegateItems.map((it) => ({ ...it, keywords: it.label }))}
                                      value={editDelegate}
                                      onValueChange={setEditDelegate}
                                      placeholder="Select delegate"
                                      searchPlaceholder="Search users by name or username…"
                                      emptyText="No eligible delegates. Use an unassigned user or a member of this workspace."
                                    />
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        </ScrollArea>

                        <DialogFooter>
                          <Button variant="outline" onClick={() => setEditOpenForId(null)}>
                            Cancel
                          </Button>
                          <Button
                            disabled={editSaving}
                            onClick={async () => {
                              const ok = await handleEditWorkspace(row);
                              if (ok) setEditOpenForId(null);
                            }}
                          >
                            {editSaving ? "Saving..." : "Save Changes"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Deactivate / Activate */}
                    {isActive ? (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-destructive hover:text-destructive"
                            >
                              <PowerOff className="size-4" />
                            </Button>
                          }
                        />

                        <DialogContent className="sm:max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Deactivate</DialogTitle>
                            <DialogDescription className="pt-2 leading-6 text-left">
                              {item.isBranchParent ? (
                                <>
                                  Deactivating &ldquo;{item.name}&rdquo; suspends this
                                  branch-workspace <strong>and all {item.branchCount} of its
                                  branches</strong> — every member across all branches is
                                  locked out until it is re-activated.
                                </>
                              ) : (
                                <>
                                  Deactivating &ldquo;{item.name}&rdquo; suspends the
                                  workspace — its members are locked out of the site until it
                                  is re-activated.
                                </>
                              )}
                            </DialogDescription>
                          </DialogHeader>

                          <DialogFooter>
                            <DialogClose render={<Button variant="outline">Cancel</Button>} />
                            <DialogClose
                              render={
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDeactivateWorkspace(row)}
                                >
                                  Deactivate
                                </Button>
                              }
                            />
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <Dialog>
                        <DialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-green-600 hover:text-green-600 dark:text-green-400"
                            >
                              <Power className="size-4" />
                            </Button>
                          }
                        />

                        <DialogContent className="sm:max-w-sm">
                          <DialogHeader>
                            <DialogTitle>Reactivate Workspace?</DialogTitle>
                            <DialogDescription className="pt-2 leading-6 text-left">
                              {item.isBranchParent ? (
                                <>
                                  Reactivating &ldquo;{item.name}&rdquo; restores access for
                                  this branch-workspace <strong>and all {item.branchCount} of
                                  its branches</strong> — their members will be able to sign
                                  in and send messages again.
                                </>
                              ) : (
                                <>
                                  Reactivating &ldquo;{item.name}&rdquo; restores access for
                                  all its members — they will be able to sign in and send
                                  messages again.
                                </>
                              )}
                            </DialogDescription>
                          </DialogHeader>

                          <DialogFooter>
                            <DialogClose render={<Button variant="outline">Back</Button>} />
                            <DialogClose
                              render={
                                <Button onClick={() => handleActivateWorkspace(row)}>
                                  Reactivate
                                </Button>
                              }
                            />
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
      {/* ── View Workspace Dialog ── */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle className="text-xl font-bold">
              {viewWs?.name ?? "Workspace Details"}
            </DialogTitle>
            <DialogDescription>
              {viewWs?.code} · {viewWs?.kind ?? "workspace"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-y-auto px-6 pb-6">
            {viewLoading && !viewWs ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : viewWs ? (
              <div className="space-y-6">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{viewWs.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Code</p>
                    <p className="font-mono font-medium">{viewWs.code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kind</p>
                    <p className="font-medium capitalize">{viewWs.kind ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Division</p>
                    <p className="font-medium">{viewWs.division ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge
                      variant="outline"
                      className={
                        viewWs.status === "ACTIVE"
                          ? "border-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                          : "border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      }
                    >
                      {viewWs.status === "ACTIVE" ? "Active" : "Suspended"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Admin</p>
                    <p className="font-medium">{viewWs.adminName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sender Mask</p>
                    <p className="font-medium">{viewWs.senderMask ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {viewWs.parentWorkspaceId
                        ? `Daily SMS Limit (set on ${viewWs.parentName ?? "the branch-workspace"})`
                        : "Daily SMS Limit"}
                    </p>
                    <p className="font-medium">
                      {viewWs.parentWorkspaceId
                        ? "Inherited"
                        : viewWs.dailySmsLimit != null
                          ? viewWs.dailySmsLimit.toLocaleString()
                          : "Unlimited"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Members</p>
                    <p className="font-medium">{viewWs.memberCount}</p>
                  </div>
                </div>

                <Separator />

                {/* Permissions */}
                <div className="space-y-2">
                  <p className="font-semibold text-sm">Permissions</p>
                  {viewWs.permissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None assigned</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {viewWs.permissions.map((code) => {
                        const def = [
                          ...WORKSPACE_PERMISSIONS_LEFT,
                          ...WORKSPACE_PERMISSIONS_RIGHT,
                        ].find((p) => p.code === code);
                        return (
                          <span
                            key={code}
                            className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                            title={def?.desc}
                          >
                            {def?.title ?? code}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Members */}
                <div className="space-y-2">
                  <p className="font-semibold text-sm">
                    Members{" "}
                    <span className="text-muted-foreground font-normal">
                      ({viewMembers.length})
                    </span>
                  </p>
                  {viewLoading ? (
                    <p className="text-sm text-muted-foreground">Loading members…</p>
                  ) : viewMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Username</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {viewMembers.map((m) => (
                            <tr key={m.userId}>
                              <td className="px-3 py-2 font-medium">{m.displayName}</td>
                              <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{m.username}</td>
                              <td className="px-3 py-2">
                                <span className="rounded-full bg-accent px-2 py-0.5 text-xs capitalize">
                                  {m.role === "CEO"
                                    ? "Delegate"
                                    : m.role.toLowerCase().replace("_", " ")}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </ScrollArea>

          <div className="px-6 py-4 shrink-0 border-t flex justify-end">
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
