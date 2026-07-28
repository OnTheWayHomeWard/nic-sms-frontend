"use client";

import * as React from "react";

import {
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  Plus,
  Power,
  PowerOff,
  Search,
  SquarePen,
  XCircle,
} from "lucide-react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/tablePagination";
import { Separator } from "@/components/ui/separator";
import { TempFieldHint } from "@/components/ui/temp-field-hint";

import { useAuth } from "@/contexts/AuthContext";
import {
  apiErrorMessage,
  rolesApi,
  usersApi,
  workspacesApi,
  type ApiRole,
  type ApiUser,
} from "@/lib/services";
import { AD_USERS } from "@/lib/mock-ad-users";
import { buildUsername } from "@/lib/username";

// ─── Types & constants ────────────────────────────────────────────────────────

type SortField = "username" | "displayName" | "role" | "status" | "lastLogin";
type SortDir = "asc" | "desc";

// Roles a DEPT_HEAD can always assign within their workspace. "CEO" (the
// delegate role) is appended separately when the workspace has delegation
// enabled — see `delegationEnabled` in UserManagementPage.
const WORKSPACE_ROLE_CODES = ["DEPT_HEAD", "OPERATOR", "VIEWER"];

const ROLE_LABELS: Record<string, string> = {
  DEPT_HEAD: "Dept Head",
  OPERATOR: "Operator",
  VIEWER: "Viewer",
  // Never show the raw "CEO" code — always present it as "Delegate".
  CEO: "Delegate",
};

interface Row {
  user: ApiUser;
  /** Role code within the current workspace. */
  role: string;
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}

// ─── Create User Dialog ──────────────────────────────────────────────────────

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleItems: { value: string; label: string }[];
  saving: boolean;
  onSave: (data: {
    username: string;
    displayName: string;
    /** Blank for a domain account — AD holds the credential, not eSMS. */
    password: string;
    roleCode: string | null;
  }) => void;
}

function CreateUserDialog({
  open,
  onOpenChange,
  roleItems,
  saving,
  onSave,
}: CreateUserDialogProps) {
  const { user: currentUser } = useAuth();
  const [adUser, setAdUser] = React.useState("");
  const [roleCode, setRoleCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);

  // Workspace/division are implicit here (this page is scoped to the
  // signed-in admin's own workspace), so the username still follows the
  // workspace-[division]-role-name format without asking the admin to pick them.
  const roleLabel = roleItems.find((r) => r.value === roleCode)?.label ?? "";
  const username = React.useMemo(
    () =>
      adUser
        ? buildUsername(
            currentUser?.workspaceName ?? "",
            roleLabel,
            adUser,
            currentUser?.division ?? "",
          )
        : "",
    [adUser, roleLabel, currentUser?.workspaceName, currentUser?.division],
  );

  React.useEffect(() => {
    if (open) {
      setAdUser("");
      setRoleCode("");
      setPassword("");
      setShowPassword(false);
    }
  }, [open]);

  function handleSave() {
    // Password is deliberately not required: this user signs in against Active
    // Directory, which owns their credential.
    if (!adUser) {
      toast.error("Please provide a user from AD.", {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 6000,
      });
      return;
    }
    onSave({
      username,
      displayName: adUser,
      password,
      roleCode: roleCode || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader guideId="um-user-form">
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Username format: workspace-[division]-role-name
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>
              Username <span className="text-destructive">*</span>
            </Label>
            <Input
              readOnly
              value={username}
              placeholder="underwriting-royal-admin-Girma"
              className="font-mono bg-muted/50 text-muted-foreground"
            />
          </div>

          <div className="space-y-1.5" data-guide="um-user">
            <Label>
              Select User <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              items={AD_USERS.map((u) => ({ value: u, label: u }))}
              value={adUser}
              onValueChange={setAdUser}
              placeholder="Select user from AD"
              searchPlaceholder="Search users…"
              emptyText="No matching users."
            />
            <TempFieldHint>
              Temporary mock list — AD integration pending.
            </TempFieldHint>
          </div>

          <div className="space-y-1.5" data-guide="um-role">
            <Label>Role</Label>
            <SearchableSelect
              items={roleItems}
              value={roleCode}
              onValueChange={setRoleCode}
              placeholder="Select role (optional)"
              searchPlaceholder="Search roles…"
              emptyText="No roles found."
            />
            <p className="text-xs text-muted-foreground">
              Role is optional — assign it now to grant access, or leave it
              blank and add a role later.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>
              Password{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank: this user signs in with their Active Directory
              password. Set one only for an account AD does not hold.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            <Plus />
            {saving ? "Creating..." : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit User Dialog ────────────────────────────────────────────────────────

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: Row | null;
  roleItems: { value: string; label: string }[];
  saving: boolean;
  onSave: (data: { roleCode: string; password: string }) => void;
}

function EditUserDialog({
  open,
  onOpenChange,
  row,
  roleItems,
  saving,
  onSave,
}: EditUserDialogProps) {
  const [roleCode, setRoleCode] = React.useState("");
  const [password, setPassword] = React.useState("");

  React.useEffect(() => {
    if (open && row) {
      setRoleCode(row.role);
      setPassword("");
    }
  }, [open, row]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader guideId="um-user-form">
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input
              readOnly
              value={row?.user.username ?? ""}
              className="bg-muted/50 font-mono text-muted-foreground"
            />
          </div>

          <div className="space-y-1.5" data-guide="um-role">
            <Label>Role</Label>
            <SearchableSelect
              items={roleItems}
              value={roleCode}
              onValueChange={setRoleCode}
              placeholder="Select role"
              searchPlaceholder="Search roles…"
              emptyText="No roles found."
            />
            <p className="text-xs text-muted-foreground">
              A user&apos;s permissions are determined by their role.
            </p>
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="Leave blank to keep current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Only affects accounts Active Directory does not hold. A domain
              user&apos;s password lives in AD and cannot be changed from here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onSave({ roleCode, password })} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sortable Header ──────────────────────────────────────────────────────────

function SortableHead({
  children,
  field,
  sortField,
  onSort,
}: {
  children: React.ReactNode;
  field: SortField;
  sortField: SortField | null;
  sortDir?: SortDir;
  onSort: (field: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <TableHead>
      <button
        onClick={() => onSort(field)}
        className="flex items-center gap-1 text-left hover:text-foreground transition-colors"
      >
        {children}
        <ArrowUpDown className={`size-3.5 ${active ? "text-foreground" : "text-muted-foreground"}`} />
      </button>
    </TableHead>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { user: currentUser, workspacePermissions } = useAuth();
  const workspaceId = currentUser?.workspaceId ?? null;
  // The Delegate (backend role "CEO") is normally set via the workspace's
  // delegate picker (SUPER_ADMIN-only), but a DEPT_HEAD should still be able
  // to assign it directly once their workspace has delegation turned on.
  const delegationEnabled = workspacePermissions.includes("DELEGATION");

  const [rows, setRows] = React.useState<Row[]>([]);
  const [roles, setRoles] = React.useState<ApiRole[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("All Roles");
  const [statusFilter, setStatusFilter] = React.useState("All Statuses");
  const [sortField, setSortField] = React.useState<SortField | null>(null);
  const [sortDir, setSortDir] = React.useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);
  const [pageKey, setPageKey] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Row | null>(null);
  const [statusTarget, setStatusTarget] = React.useState<Row | null>(null);

  // role code → roleId, for membership add / change-role calls
  const roleIdByCode = React.useMemo(() => {
    const map: Record<string, string> = {};
    roles.forEach((r) => {
      map[r.code] = r.id;
    });
    return map;
  }, [roles]);

  const roleItems = React.useMemo(() => {
    const codes = delegationEnabled
      ? [...WORKSPACE_ROLE_CODES, "CEO"]
      : WORKSPACE_ROLE_CODES;
    return codes
      .filter((c) => roleIdByCode[c])
      .map((c) => ({ value: c, label: ROLE_LABELS[c] ?? c }));
  }, [roleIdByCode, delegationEnabled]);

  const loadUsers = React.useCallback(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    usersApi
      .list()
      .then((users) => {
        // Only users who are members of the current workspace, with their role here.
        const next: Row[] = [];
        users.forEach((u) => {
          const membership = u.memberships.find((m) => m.workspaceId === workspaceId);
          if (membership) next.push({ user: u, role: membership.role });
        });
        setRows(next);
      })
      .catch((err) => {
        toast.error(apiErrorMessage(err, "Failed to load users."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
          duration: 7000,
        });
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  React.useEffect(() => {
    rolesApi
      .list()
      .then(setRoles)
      .catch(() => {
        /* role select falls back to empty */
      });
  }, []);

  React.useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredRows = React.useMemo(() => {
    let result = rows.filter(({ user, role }) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        user.username.toLowerCase().includes(q) ||
        user.displayName.toLowerCase().includes(q);
      const matchesRole = roleFilter === "All Roles" || role === roleFilter;
      const statusLabel = user.status === "ACTIVE" ? "Active" : "Inactive";
      const matchesStatus =
        statusFilter === "All Statuses" || statusLabel === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        const pick = (r: Row) => {
          switch (sortField) {
            case "username":
              return r.user.username;
            case "displayName":
              return r.user.displayName;
            case "role":
              return r.role;
            case "status":
              return r.user.status;
            case "lastLogin":
              return r.user.lastLoginAt ?? "";
            default:
              return "";
          }
        };
        const av = String(pick(a));
        const bv = String(pick(b));
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [rows, search, roleFilter, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * rowsPerPage;
  const paged = filteredRows.slice(pageStart, pageStart + rowsPerPage);
  const placeholderCount = rowsPerPage - paged.length;

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

  async function handleCreate(data: {
    username: string;
    displayName: string;
    password: string;
    roleCode: string | null;
  }) {
    setSaving(true);
    try {
      // 1) Create the global user account.
      const created = await usersApi.create({
        username: data.username,
        displayName: data.displayName,
        // Omitted entirely when blank, so the account is created with no local
        // password hash at all rather than one derived from an empty string.
        ...(data.password.trim() ? { password: data.password } : {}),
      });
      // 2) Optionally add to the current workspace if a role was selected.
      if (data.roleCode && workspaceId) {
        const roleId = roleIdByCode[data.roleCode];
        if (roleId) {
          await workspacesApi.addMember(workspaceId, created.id, roleId);
        }
      }
      setCreateOpen(false);
      toast.success(
        data.roleCode && workspaceId
          ? "User created and added to workspace."
          : "User created.",
        { icon: <CheckCircle2 className="size-4" strokeWidth={2.5} /> },
      );
      loadUsers();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to create user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(data: { roleCode: string; password: string }) {
    if (!editTarget || !workspaceId) return;
    const roleId = roleIdByCode[data.roleCode];
    const name = editTarget.user.displayName || editTarget.user.username;
    setSaving(true);
    try {
      if (data.password.trim()) {
        await usersApi.update(editTarget.user.id, { password: data.password });
      }
      if (data.roleCode !== editTarget.role && roleId) {
        await workspacesApi.changeMemberRole(workspaceId, editTarget.user.id, roleId);
      }
      setEditTarget(null);
      toast.success(`"${name}" updated.`, {
        icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
      });
      loadUsers();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update user."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!statusTarget) return;
    const { user } = statusTarget;
    const name = user.displayName || user.username;
    const wasActive = user.status === "ACTIVE";
    try {
      const updated = wasActive
        ? await usersApi.deactivate(user.id)
        : await usersApi.activate(user.id);
      setRows((prev) =>
        prev.map((r) => (r.user.id === updated.id ? { ...r, user: updated } : r)),
      );
      setStatusTarget(null);
      toast.success(
        wasActive
          ? `"${name}" deactivated. They can no longer sign in until reactivated.`
          : `"${name}" reactivated.`,
        {
          icon: <CheckCircle2 className="size-4" strokeWidth={2.5} />,
          ...(wasActive ? { duration: 6000 } : {}),
        },
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update user status."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    }
  }

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-1 text-sm">
      <span className="text-muted-foreground">{filteredRows.length} result(s)</span>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground whitespace-nowrap">Rows per page</span>
        <Select
          value={String(rowsPerPage)}
          onValueChange={(value) => {
            setRowsPerPage(Number(value));
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-8 w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 20, 50].map((row) => (
              <SelectItem key={row} value={String(row)}>{row}</SelectItem>
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">Manage users in your workspace</p>
      </div>
      <Separator />

      {!workspaceId ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">
          No active workspace context — user management is scoped to a workspace.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={roleFilter} onValueChange={(v) => v && setRoleFilter(v)}>
              <SelectTrigger className="w-36">
                <span className="flex-1 text-sm text-left">
                  {roleFilter === "All Roles" ? "All Roles" : (ROLE_LABELS[roleFilter] ?? roleFilter)}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Roles">All Roles</SelectItem>
                {WORKSPACE_ROLE_CODES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger className="w-32">
                <span className="flex-1 text-sm text-left">{statusFilter}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Statuses">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Button className="ml-auto" onClick={() => setCreateOpen(true)} data-guide="um-new">
              <Plus className="size-4" />
              New User
            </Button>
          </div>

          <Table pagination={pagination}>
            <TableHeader>
              <TableRow>
                <SortableHead field="username" sortField={sortField} onSort={handleSort}>
                  Username
                </SortableHead>
                <SortableHead field="displayName" sortField={sortField} onSort={handleSort}>
                  Full Name
                </SortableHead>
                <SortableHead field="role" sortField={sortField} onSort={handleSort}>
                  Role
                </SortableHead>
                <SortableHead field="status" sortField={sortField} onSort={handleSort}>
                  Status
                </SortableHead>
                <SortableHead field="lastLogin" sortField={sortField} onSort={handleSort}>
                  Last Login
                </SortableHead>
                <TableHead className="pl-4 w-28 text-left">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody key={pageKey} className="animate-in fade-in duration-200">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {paged.map(({ user, role }) => {
                    const isActive = user.status === "ACTIVE";
                    return (
                      <TableRow
                        key={user.id}
                        className={!isActive ? "opacity-60" : ""}
                      >
                        <TableCell className="pl-4 font-mono text-xs">{user.username}</TableCell>
                        <TableCell>{user.displayName}</TableCell>
                        <TableCell className="text-xs uppercase tracking-wide">
                          {ROLE_LABELS[role] ?? role}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              isActive
                                ? "border-0 bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : "border-0 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }
                          >
                            {isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatLastLogin(user.lastLoginAt)}
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon-sm" onClick={() => setEditTarget({ user, role })}>
                              <SquarePen className="size-4" />
                            </Button>
                            {isActive ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setStatusTarget({ user, role })}
                              >
                                <PowerOff className="size-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-green-600 hover:text-green-600 dark:text-green-400"
                                onClick={() => setStatusTarget({ user, role })}
                              >
                                <Power className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {Array.from({ length: placeholderCount }).map((_, i) => (
                    <TableRow
                      key={`ph-${i}`}
                      className="pointer-events-none border-b-0 hover:bg-transparent"
                    >
                      <TableCell colSpan={6} className="p-0 h-10" />
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roleItems={roleItems}
        saving={saving}
        onSave={handleCreate}
      />

      <EditUserDialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
        row={editTarget}
        roleItems={roleItems}
        saving={saving}
        onSave={handleEdit}
      />

      <Dialog open={!!statusTarget} onOpenChange={(open) => !open && setStatusTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.user.status === "ACTIVE" ? "Deactivate User" : "Reactivate User"}
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.user.status === "ACTIVE"
                ? `Are you sure you want to deactivate "${statusTarget?.user.displayName}"? They will not be able to sign in.`
                : `Reactivate "${statusTarget?.user.displayName}" so they can sign in again.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>Cancel</Button>
            <Button
              variant={statusTarget?.user.status === "ACTIVE" ? "destructive" : "default"}
              onClick={handleToggleStatus}
            >
              {statusTarget?.user.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
