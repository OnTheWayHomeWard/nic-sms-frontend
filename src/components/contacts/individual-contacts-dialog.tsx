"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Power, PowerOff, SquarePen, Search, X, XCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { apiErrorMessage, contactsApi, type ApiContact } from "@/lib/services";

/**
 * Manage individual contacts within the workspace: rename, toggle the opt-out
 * flag (an opted-out contact is skipped by every send — compliance relevant),
 * and activate/deactivate. Backed by the /contacts endpoints.
 */
export function IndividualContactsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [contacts, setContacts] = React.useState<ApiContact[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ACTIVE");
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  // Target-based confirm state — a single ConfirmDialog serves the whole list.
  const [optOutTarget, setOptOutTarget] = React.useState<ApiContact | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<ApiContact | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    const fetches =
      statusFilter === "ALL"
        ? Promise.all([contactsApi.list("ACTIVE"), contactsApi.list("INACTIVE")]).then(
            ([a, b]) => [...a, ...b],
          )
        : contactsApi.list(statusFilter);
    Promise.resolve(fetches)
      .then(setContacts)
      .catch((err) =>
        toast.error(apiErrorMessage(err, "Failed to load contacts."), {
          icon: <XCircle className="size-4" strokeWidth={2.5} />,
        }),
      )
      .finally(() => setLoading(false));
  }, [statusFilter]);

  React.useEffect(() => {
    if (open) load();
    else {
      setSearch("");
      setEditing(null);
    }
  }, [open, load]);

  function patch(updated: ApiContact) {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function toggleOptOut(c: ApiContact) {
    setBusy(c.id);
    try {
      patch(await contactsApi.update(c.id, { optOut: !c.optOut }));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update opt-out status."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setBusy(null);
    }
  }

  async function toggleStatus(c: ApiContact) {
    setBusy(c.id);
    try {
      const updated = c.status === "ACTIVE" ? await contactsApi.deactivate(c.id) : await contactsApi.activate(c.id);
      // Dropping out of the current filter? remove from view; else patch.
      if (statusFilter !== "ALL" && updated.status !== statusFilter) {
        setContacts((prev) => prev.filter((x) => x.id !== c.id));
      } else {
        patch(updated);
      }
      const deactivated = updated.status !== "ACTIVE";
      toast.success(
        `Contact ${deactivated ? "deactivated" : "activated"}.`,
        deactivated ? { duration: 6000 } : undefined,
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to update contact status."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      patch(await contactsApi.update(editing.id, { name: editing.name.trim() }));
      setEditing(null);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to rename."), {
        icon: <XCircle className="size-4" strokeWidth={2.5} />,
        duration: 7000,
      });
    } finally {
      setBusy(null);
    }
  }

  const q = search.toLowerCase().replace(/\s/g, "");
  const filtered = contacts.filter((c) => {
    if (!q) return true;
    return (
      c.phoneE164.replace(/\s/g, "").toLowerCase().includes(q) ||
      (c.name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh]">
        <DialogHeader guideId="individual-contacts">
          <DialogTitle>Individual Contacts</DialogTitle>
          <DialogDescription>
            Rename, opt out, or deactivate individual contacts. Opted-out contacts
            are skipped by every send.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2" data-guide="ic-search">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="w-32 h-9">
              <span className="text-sm">
                {statusFilter === "ALL" ? "All" : statusFilter === "ACTIVE" ? "Active" : "Inactive"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="h-[52vh] rounded-md border">
          <div className="divide-y">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-3">
                  <Skeleton className="h-8 w-full rounded" />
                </div>
              ))
            ) : filtered.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No contacts found.</p>
            ) : (
              filtered.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 text-sm" data-guide="ic-row">
                  <div className="min-w-0 flex-1">
                    {editing?.id === c.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editing.name}
                          onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                          className="h-7 text-sm"
                          placeholder="Name"
                        />
                        <Button size="icon-sm" className="size-7" disabled={busy === c.id} onClick={saveName}>
                          <Check className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => setEditing(null)}>
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{c.name || "—"}</span>
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing({ id: c.id, name: c.name ?? "" })}
                          title="Rename"
                        >
                          <SquarePen className="size-3.5" />
                        </button>
                        {c.status !== "ACTIVE" && (
                          <Badge variant="outline" className="border-0 bg-muted text-muted-foreground text-[10px]">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">{c.phoneE164}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Switch
                        checked={c.optOut}
                        onCheckedChange={(checked) =>
                          checked ? setOptOutTarget(c) : toggleOptOut(c)
                        }
                        disabled={busy === c.id}
                        className={cn(c.optOut && "data-[state=checked]:bg-destructive")}
                      />
                      Opted out
                    </Label>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={c.status === "ACTIVE" ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}
                      title={c.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      disabled={busy === c.id}
                      onClick={() =>
                        c.status === "ACTIVE" ? setDeactivateTarget(c) : toggleStatus(c)
                      }
                    >
                      {c.status === "ACTIVE" ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Opting a contact OUT is compliance-relevant — confirm the ON
            direction only; turning opt-out back off stays instant. */}
        <ConfirmDialog
          open={!!optOutTarget}
          onOpenChange={(next) => !next && setOptOutTarget(null)}
          title="Opt This Contact Out?"
          description="This contact will be skipped on every future send — across every campaign, reminder, and group — until you opt them back in."
          destructive
          confirmLabel="Opt Out"
          onConfirm={() => {
            const target = optOutTarget;
            setOptOutTarget(null);
            if (target) toggleOptOut(target);
          }}
        />

        {/* Deactivating hides a contact from new sends — confirm before it,
            instant when reactivating. */}
        <ConfirmDialog
          open={!!deactivateTarget}
          onOpenChange={(next) => !next && setDeactivateTarget(null)}
          title="Deactivate Contact?"
          description="This contact will be hidden from new sends without losing their history. You can reactivate them anytime."
          destructive
          confirmLabel="Deactivate"
          onConfirm={() => {
            const target = deactivateTarget;
            setDeactivateTarget(null);
            if (target) toggleStatus(target);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
