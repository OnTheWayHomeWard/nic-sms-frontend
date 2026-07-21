"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  value: string;
  label: string;
  /** Extra text to match against when searching (e.g. username, email). */
  keywords?: string;
}

/**
 * A single-select dropdown with a built-in search box — for pickers whose
 * option list can grow long (users, workspaces). Same value/onValueChange
 * shape as the plain Select so it drops in where a searchable list is wanted.
 * Built on Popover (not Base UI Select) so the search input can live inside
 * the panel and filter the options as you type.
 */
export function SearchableSelect({
  items,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches found.",
  disabled,
  className,
  id,
}: {
  items: ComboboxItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((i) =>
        `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(q),
      )
    : items;

  // Reset the query each time the panel closes so it opens fresh next time.
  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
          className,
        )}
      >
        <span className={cn("line-clamp-1 text-left", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        // Base UI defers this ref's focus() call until after the popup is
        // positioned by floating-ui. The native `autoFocus` attribute used to
        // sit here instead — it fires synchronously on mount, before
        // floating-ui has placed the popup, so the browser's focus-scroll
        // behavior would jump the whole page to wherever the unpositioned
        // element briefly sat (often the very top of the document).
        initialFocus={inputRef}
        className="w-(--anchor-width) min-w-56 max-w-[min(28rem,var(--available-width))] gap-0 p-0"
      >
        <div className="relative border-b">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 border-0 pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onValueChange(item.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                  item.value === value && "bg-accent/50",
                )}
              >
                <Check
                  className={cn(
                    "size-4 shrink-0",
                    item.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="line-clamp-1">{item.label}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
