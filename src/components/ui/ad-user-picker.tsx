"use client";

import * as React from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { adApi, apiErrorMessage, type ApiAdUser } from "@/lib/services";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Picks a staff account from Active Directory. Same look as SearchableSelect,
 * but the search runs in the directory (GET /ad/users) rather than over a
 * list held in memory — the domain holds far more accounts than are worth
 * loading up front. Accounts that already have an eSMS user are shown but
 * can't be picked, so the same person isn't added twice.
 */
export function AdUserPicker({
  value,
  onValueChange,
  placeholder = "Select user from AD",
  disabled,
  className,
  id,
}: {
  value: ApiAdUser | null;
  onValueChange: (user: ApiAdUser | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [users, setUsers] = React.useState<ApiAdUser[]>([]);
  const [truncated, setTruncated] = React.useState(false);
  // The query the current results (or error) answer. Derived rather than a
  // separate loading flag: the list is stale whenever it lags the query.
  const [answeredQuery, setAnsweredQuery] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const loading = open && answeredQuery !== query;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Reset the query each time the panel closes so it opens fresh next time.
    if (!next) setQuery("");
  }

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      adApi
        .searchUsers(query.trim(), 50, controller.signal)
        .then((res) => {
          setUsers(res.users);
          setTruncated(res.truncated);
          setError(null);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setUsers([]);
          setTruncated(false);
          setError(apiErrorMessage(err, "Could not load users from Active Directory."));
        })
        .finally(() => {
          if (!controller.signal.aborted) setAnsweredQuery(query);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          className,
        )}
      >
        <span className={cn("line-clamp-1 text-left", !value && "text-muted-foreground")}>
          {value ? `${value.displayName} (${value.samAccountName})` : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        // See SearchableSelect: focus via initialFocus, not autoFocus, so the
        // page doesn't jump before floating-ui has positioned the popup.
        initialFocus={inputRef}
        className="w-(--anchor-width) min-w-64 max-w-[min(28rem,var(--available-width))] gap-0 p-0"
      >
        <div className="relative border-b">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, login or email…"
            className="h-9 border-0 pl-8 pr-8 shadow-none focus-visible:ring-0"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {error ? (
            <p className="px-2 py-6 text-center text-sm text-destructive">{error}</p>
          ) : users.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {loading ? "Searching Active Directory…" : "No matching users."}
            </p>
          ) : (
            users.map((user) => {
              const taken = user.existingUserId !== null;
              const selected = value?.samAccountName === user.samAccountName;
              return (
                <button
                  key={user.samAccountName}
                  type="button"
                  disabled={taken}
                  title={taken ? "Already has an eSMS account" : undefined}
                  onClick={() => {
                    onValueChange(user);
                    handleOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50",
                    selected && "bg-accent/50",
                  )}
                >
                  <Check className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1">{user.displayName}</span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {user.samAccountName}
                      {user.email ? ` · ${user.email}` : ""}
                    </span>
                  </span>
                  {taken && (
                    <span className="shrink-0 text-xs text-muted-foreground">Added</span>
                  )}
                </button>
              );
            })
          )}
        </div>
        {truncated && !error && (
          <p className="border-t px-2.5 py-1.5 text-xs text-muted-foreground">
            Showing the first {users.length} matches — type to narrow the search.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
