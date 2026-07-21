"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, CircleHelp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveGuide, getDialogGuide, type GuideStep, type PageGuide } from "@/lib/guides";

/**
 * Route-aware "?" button for the app header. Opens an interactive, step-by-step
 * walkthrough of the current page: steps anchored to a real element get a
 * spotlight cut-out over it; steps without one (or whose element isn't on
 * screen for this user's role) render as a centered card instead.
 */
export function PageGuideButton() {
  const location = useLocation();
  const guide = resolveGuide(location.pathname);
  const [open, setOpen] = React.useState(false);

  // Close the tour when navigating away so a stale guide never lingers.
  React.useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!guide) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title={`How ${guide.title} works`}
        onClick={() => setOpen(true)}
      >
        <CircleHelp className="size-5" />
        <span className="sr-only">Open page guide</span>
      </Button>
      {open && <GuideTour guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Same idea as PageGuideButton, but for content that lives inside a modal
 * Dialog instead of a routed page. Dialogs don't change the URL, so this
 * takes an explicit id (see lib/guides.ts DIALOG_GUIDES) rather than
 * resolving from the route.
 *
 * IMPORTANT: this must be rendered INSIDE the dialog's own DialogContent
 * subtree (e.g. via <DialogHeader guideId="...">). Base UI's modal Dialog
 * traps focus and inerts everything outside itself — including the app
 * header — so a trigger placed anywhere else becomes unreachable the moment
 * the dialog opens.
 */
export function DialogGuideButton({
  guideId,
  className,
  title,
}: {
  guideId: string;
  className?: string;
  title?: string;
}) {
  const guide = getDialogGuide(guideId);
  const [open, setOpen] = React.useState(false);

  if (!guide) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={title ?? `How this works`}
        className={cn("text-muted-foreground", className)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <CircleHelp className="size-4" />
        <span className="sr-only">Open guide</span>
      </Button>
      {open && <GuideTour guide={guide} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Tour overlay ───────────────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 360;
const CARD_GAP = 12;

function GuideTour({ guide, onClose }: { guide: PageGuide; onClose: () => void }) {
  // Steps whose anchor is role-gated (marked optional) drop out when their
  // element isn't rendered, so viewers never get told about buttons they
  // don't have. Evaluated once at open — the tour is modal, nothing mounts
  // meanwhile.
  const [steps] = React.useState<GuideStep[]>(() =>
    guide.steps.filter(
      (s) => !s.optional || (!!s.selector && !!document.querySelector(s.selector)),
    ),
  );
  const [idx, setIdx] = React.useState(0);
  const step = steps[idx];
  const rect = useSpotlightRect(step?.selector, idx);

  const next = React.useCallback(
    () => setIdx((i) => (i + 1 >= steps.length ? i : i + 1)),
    [steps.length],
  );
  const back = React.useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const isLast = idx === steps.length - 1;

  // Live demonstration: drive the real UI as each step opens, so the user sees
  // the effect (a picker appearing, a panel expanding) instead of just reading
  // about it. on/off are idempotent — they inspect the control's checked state
  // and only click when it needs to change — so stepping back and forth is safe.
  React.useEffect(() => {
    const action = step?.action;
    if (!action) return;
    const isChecked = (el: Element) =>
      el.getAttribute("aria-checked") === "true" ||
      el.getAttribute("aria-pressed") === "true" ||
      el.hasAttribute("data-checked") ||
      el.getAttribute("data-state") === "checked" ||
      el.getAttribute("data-state") === "on" ||
      (el as HTMLInputElement).checked === true;
    // Let the spotlight scroll settle before driving the control.
    const t = window.setTimeout(() => {
      if (action.click) {
        (document.querySelector(action.click) as HTMLElement | null)?.click();
      }
      if (action.on) {
        const el = document.querySelector(action.on);
        if (el && !isChecked(el)) (el as HTMLElement).click();
      }
      if (action.off) {
        const el = document.querySelector(action.off);
        if (el && isChecked(el)) (el as HTMLElement).click();
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [step]);

  React.useEffect(() => {
    // Captured (not bubbled) and stopped here so a guide opened from inside a
    // Base UI Dialog only closes the guide on Escape — without this, the
    // dialog's own dismiss-on-escape listener (attached to document when it
    // opened, ahead of this one) would see the same keypress and close both
    // at once.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.stopPropagation();
        next();
      } else if (e.key === "ArrowLeft") {
        e.stopPropagation();
        back();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, back, onClose]);

  if (steps.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label={`${guide.title} guide`}>
      {/* Click-catcher: keeps the page inert while the tour is open. A click
          on the dimmed area advances (matching the "click anywhere" habit). */}
      <div className="absolute inset-0" onClick={isLast ? onClose : next} />

      {rect ? (
        // Spotlight: a transparent box over the target whose huge box-shadow
        // dims everything else. A white halo + brand ring + soft glow make the
        // focused element pop in BOTH light and dark themes (a plain
        // ring-primary was nearly invisible against the dark dim). pointer
        // events stay off so the click-catcher handles input.
        <div
          className="absolute rounded-lg transition-all duration-200 pointer-events-none"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: [
              "0 0 0 2px rgba(255,255,255,0.95)",
              "0 0 0 5px var(--primary, #6366f1)",
              "0 0 0 100vmax rgba(0,0,0,0.62)",
              "0 0 28px 8px color-mix(in srgb, var(--primary, #6366f1) 55%, transparent)",
            ].join(", "),
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/62 pointer-events-none" />
      )}

      <GuideCard
        guide={guide}
        step={step}
        idx={idx}
        total={steps.length}
        rect={rect}
        onNext={next}
        onBack={back}
        onClose={onClose}
        setIdx={setIdx}
      />
    </div>,
    document.body,
  );
}

function GuideCard({
  guide,
  step,
  idx,
  total,
  rect,
  onNext,
  onBack,
  onClose,
  setIdx,
}: {
  guide: PageGuide;
  step: GuideStep;
  idx: number;
  total: number;
  rect: DOMRect | null;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  setIdx: (i: number) => void;
}) {
  const isLast = idx === total - 1;

  // Anchored: below the target when there's room, above otherwise; clamped to
  // the viewport. Unanchored: centered.
  let style: React.CSSProperties;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - 24);
    const spaceBelow = vh - rect.bottom;
    const top =
      spaceBelow > 260
        ? rect.bottom + SPOTLIGHT_PADDING + CARD_GAP
        : Math.max(12, rect.top - SPOTLIGHT_PADDING - CARD_GAP - 240);
    const left = Math.min(Math.max(12, rect.left), vw - width - 12);
    style = { position: "absolute", top, left, width };
  } else {
    style = {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: Math.min(CARD_WIDTH, window.innerWidth - 24),
    };
  }

  return (
    <div
      className="rounded-xl border bg-card text-card-foreground shadow-2xl p-4 space-y-3 animate-in fade-in zoom-in-95 duration-200"
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {guide.title} · Step {idx + 1} of {total}
          </p>
          <p className="font-semibold text-sm">{step.title}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1 -mt-1 shrink-0"
          onClick={onClose}
        >
          <X className="size-4" />
          <span className="sr-only">Close guide</span>
        </Button>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
        {step.body}
      </p>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i === idx ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
              )}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {idx > 0 && (
            <Button variant="outline" size="sm" className="h-8" onClick={onBack}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          )}
          <Button size="sm" className="h-8" onClick={isLast ? onClose : onNext}>
            {isLast ? "Done" : "Next"}
            {!isLast && <ArrowRight className="size-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Measures the current step's anchor element, keeping the spotlight glued to
 * it through scrolling, window resizes, and late layout shifts. */
function useSpotlightRect(selector: string | undefined, stepIdx: number) {
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });

    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    const interval = window.setInterval(measure, 200);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [selector, stepIdx]);

  return rect;
}
