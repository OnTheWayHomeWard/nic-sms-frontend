import * as React from "react";

import { cn } from "@/lib/utils";
import {
  encodingLabel,
  hasPlaceholders,
  MAX_SEGMENTS,
  smsInfo,
} from "@/lib/sms-segments";

interface SmsCounterProps {
  /** The message body exactly as it will be sent (or the template text). */
  text: string;
  /**
   * Show "estimate" when the text still holds placeholders ({{Name}},
   * ${name}). Defaults to auto-detecting them in `text`.
   */
  estimate?: boolean;
  /** Compact form (no "left" count) for tight spots such as previews. */
  compact?: boolean;
  className?: string;
}

/**
 * Live SMS counter: characters, encoding (GSM-7 / UCS-2), segments and the
 * characters left before the next segment. Uses the same rules as the
 * backend (see src/lib/sms-segments.ts), so the segment count shown is what
 * is recorded and billed per recipient.
 */
export function SmsCounter({
  text,
  estimate,
  compact = false,
  className,
}: SmsCounterProps) {
  const info = React.useMemo(() => smsInfo(text ?? ""), [text]);
  const isEstimate = estimate ?? hasPlaceholders(text ?? "");
  const ucs2 = info.encoding === "UCS2";

  return (
    <p
      className={cn(
        "text-xs text-muted-foreground tabular-nums",
        info.tooLong && "text-destructive",
        className,
      )}
      aria-live="polite"
    >
      {info.units} chars
      {info.units !== (text ?? "").length && !ucs2 && (
        <span title="Characters such as € [ ] { } ^ ~ | \ count as two">
          {" "}
          ({(text ?? "").length} typed)
        </span>
      )}
      {" · "}
      <span
        className={cn(ucs2 && !info.tooLong && "text-amber-600 dark:text-amber-400")}
        title={
          ucs2
            ? "Unicode (UCS-2): Amharic, emoji or other non-GSM characters. 70 chars per SMS, 67 per part when split."
            : "GSM-7: 160 chars per SMS, 153 per part when split."
        }
      >
        {encodingLabel(info.encoding)}
      </span>
      {" · "}
      {info.segments} SMS{info.segments !== 1 ? " parts" : ""}
      {!compact && !info.tooLong && <> · {info.remaining} left</>}
      {isEstimate && " · estimate before personalisation"}
      {info.tooLong && ` · too long (max ${MAX_SEGMENTS} parts)`}
    </p>
  );
}
