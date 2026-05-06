"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type HoverInfoSide = "top" | "bottom";
type HoverInfoAlign = "start" | "center" | "end";

type HoverInfoProps = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  side?: HoverInfoSide;
  align?: HoverInfoAlign;
  offset?: number;
  openDelayMs?: number;
  closeDelayMs?: number;
};

const VIEWPORT_PADDING_PX = 8;

export function HoverInfo({
  content,
  children,
  className,
  panelClassName,
  side = "top",
  align = "center",
  offset = 8,
  openDelayMs = 0,
  closeDelayMs = 70,
}: HoverInfoProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    top: -9999,
    left: -9999,
    opacity: 0,
  });
  const canRenderPortal = typeof document !== "undefined";

  const clearTimers = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const openTooltip = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (open || openTimerRef.current) {
      return;
    }

    if (openDelayMs <= 0) {
      setOpen(true);
      return;
    }

    openTimerRef.current = setTimeout(() => {
      setOpen(true);
      openTimerRef.current = null;
    }, openDelayMs);
  };

  const closeTooltip = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    if (!open || closeTimerRef.current) {
      return;
    }

    if (closeDelayMs <= 0) {
      setOpen(false);
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, closeDelayMs);
  };

  const closeTooltipImmediately = () => {
    clearTimers();
    setOpen(false);
  };

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) {
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    const preferredTop =
      side === "top"
        ? triggerRect.top - panelRect.height - offset
        : triggerRect.bottom + offset;
    const alternateTop =
      side === "top"
        ? triggerRect.bottom + offset
        : triggerRect.top - panelRect.height - offset;

    let top = preferredTop;
    if (top < VIEWPORT_PADDING_PX || top + panelRect.height > window.innerHeight - VIEWPORT_PADDING_PX) {
      top = alternateTop;
    }

    top = Math.max(
      VIEWPORT_PADDING_PX,
      Math.min(top, window.innerHeight - panelRect.height - VIEWPORT_PADDING_PX),
    );

    let left = triggerRect.left;
    if (align === "center") {
      left = triggerRect.left + triggerRect.width / 2 - panelRect.width / 2;
    } else if (align === "end") {
      left = triggerRect.right - panelRect.width;
    }

    left = Math.max(
      VIEWPORT_PADDING_PX,
      Math.min(left, window.innerWidth - panelRect.width - VIEWPORT_PADDING_PX),
    );

    setPanelStyle({
      top: Math.round(top),
      left: Math.round(left),
      opacity: 1,
    });
  }, [align, offset, side]);

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = requestAnimationFrame(updatePosition);
    const handleWindowChange = () => updatePosition();

    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex", className)}
        onMouseEnter={openTooltip}
        onMouseLeave={closeTooltip}
        onFocus={openTooltip}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) {
            return;
          }
          closeTooltip();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            closeTooltipImmediately();
          }
        }}
        aria-describedby={open ? tooltipId : undefined}
      >
        {children}
      </span>
      {canRenderPortal && open
        ? createPortal(
            <div
              ref={panelRef}
              id={tooltipId}
              role="tooltip"
              style={panelStyle}
              className={cn(
                "pointer-events-auto fixed z-[70] max-w-[320px] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-lg transition-opacity duration-75",
                panelClassName,
              )}
              onMouseEnter={openTooltip}
              onMouseLeave={closeTooltip}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
