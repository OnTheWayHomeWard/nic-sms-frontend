"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TypographyMuted } from "@/components/ui/typography";
import { TriangleAlert } from "lucide-react";

import {
  BACKEND_RECOGNIZED_PHONE_HEADERS,
  isBackendRecognizedPhoneHeader,
} from "@/lib/services";

export type DateCalendar = "gregorian" | "ethiopian";

export interface ColumnMapDialogProps {
  open: boolean;
  headers: string[];
  fileName: string;
  requireDateCol: boolean;
  onConfirm: (phoneCol: string, dateCol?: string, calendar?: DateCalendar) => void;
  onCancel: () => void;
}

function bestMatch(headers: string[], keywords: string[]): string {
  for (const kw of keywords) {
    const found = headers.find((h) => h.toLowerCase().includes(kw));
    if (found) return found;
  }
  return "";
}

export function ColumnMapDialog({
  open,
  headers,
  fileName,
  requireDateCol,
  onConfirm,
  onCancel,
}: ColumnMapDialogProps) {
  const suggestedPhone = React.useMemo(
    () => bestMatch(headers, ["phone", "mobile", "tel", "number", "msisdn", "cell"]),
    [headers],
  );
  const suggestedDate = React.useMemo(
    () => bestMatch(headers, ["expir", "date", "end", "policy", "due"]),
    [headers],
  );

  const [phoneCol, setPhoneCol] = React.useState(suggestedPhone);
  const [dateCol, setDateCol] = React.useState(suggestedDate);
  const [calendar, setCalendar] = React.useState<DateCalendar>("gregorian");

  React.useEffect(() => {
    setPhoneCol(suggestedPhone);
  }, [suggestedPhone]);

  React.useEffect(() => {
    setDateCol(suggestedDate);
  }, [suggestedDate]);

  const phoneRecognized = !!phoneCol && isBackendRecognizedPhoneHeader(phoneCol);
  const canConfirm = phoneRecognized && (!requireDateCol || !!dateCol);

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(
      phoneCol,
      requireDateCol ? dateCol : undefined,
      requireDateCol ? calendar : undefined,
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Map Columns</DialogTitle>
          <DialogDescription>
            Tell us which columns to use from{" "}
            <span className="font-medium text-foreground">{fileName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Phone Number Column <span className="text-destructive">*</span>
            </Label>
            <Select value={phoneCol} onValueChange={(v) => v && setPhoneCol(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select column…" />
              </SelectTrigger>
              <SelectContent>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suggestedPhone && suggestedPhone === phoneCol && (
              <TypographyMuted className="text-xs">
                Auto-suggested based on column name.
              </TypographyMuted>
            )}
            {phoneCol && !phoneRecognized && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  The import won&apos;t recognize a column named &ldquo;{phoneCol}
                  &rdquo; — it only matches these exact names (case-insensitive):{" "}
                  {BACKEND_RECOGNIZED_PHONE_HEADERS.join(", ")}. Rename this
                  column in your spreadsheet to one of these and re-upload, or
                  every row will be rejected.
                </span>
              </div>
            )}
          </div>

          {requireDateCol && (
            <div className="space-y-1.5">
              <Label>
                Policy End Date Column <span className="text-destructive">*</span>
              </Label>
              <Select value={dateCol} onValueChange={(v) => v && setDateCol(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column…" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {suggestedDate && suggestedDate === dateCol && (
                <TypographyMuted className="text-xs">
                  Auto-suggested based on column name.
                </TypographyMuted>
              )}
            </div>
          )}

          {requireDateCol && dateCol && (
            <div className="space-y-1.5">
              <Label>
                Calendar <span className="text-destructive">*</span>
              </Label>
              <Select
                value={calendar}
                onValueChange={(v) => v && setCalendar(v as DateCalendar)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gregorian">Gregorian</SelectItem>
                  <SelectItem value="ethiopian">Ethiopian (Ge&apos;ez)</SelectItem>
                </SelectContent>
              </Select>
              <TypographyMuted className="text-xs">
                Which calendar the dates in &ldquo;{dateCol}&rdquo; are written in.
              </TypographyMuted>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
