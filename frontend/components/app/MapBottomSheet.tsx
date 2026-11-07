"use client";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent,
  type KeyboardEvent,
} from "react";
import AppIcon from "@/frontend/components/ui/AppIcon";
import styles from "./MapBottomSheet.module.css";

type Snap = "peek" | "half" | "full";
const SNAPS: Snap[] = ["peek", "half", "full"];

export default function MapBottomSheet({
  id,
  label,
  header,
  children,
  onClose,
  closeLabel = "ปิดแผงข้อมูล",
  className = "",
  style,
  initialSnap = "half",
  onSnapChange,
  showClose = true,
  fillHeight = false,
}: {
  id?: string;
  label: string;
  header: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
  style?: CSSProperties;
  initialSnap?: Snap;
  onSnapChange?: (snap: Snap) => void;
  showClose?: boolean;
  fillHeight?: boolean;
}) {
  const contentId = useId();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ y: number; height: number; raw: number } | null>(
    null,
  );
  const dragged = useRef(false);
  const [snap, setSnap] = useState<Snap>(initialSnap);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [sizes, setSizes] = useState({ peek: 180, max: 600, keyboard: 0 });
  const heights = {
    peek: sizes.peek,
    half: Math.max(sizes.peek, Math.min(sizes.max, sizes.max * 0.56)),
    full: sizes.max,
  };
  function select(next: Snap) {
    setSnap(next);
    setDragHeight(null);
    onSnapChange?.(next);
  }
  useLayoutEffect(() => {
    const element = root.current,
      parent = element?.closest(".cp-map") ?? element?.parentElement;
    if (!element || !parent) return;
    const measure = () => {
      const parentHeight = parent.getBoundingClientRect().height;
      if (!parentHeight) return;
      const viewport = window.visualViewport;
      const keyboard = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      const bottom = parseFloat(getComputedStyle(element).bottom) || 86;
      const previousKeyboard =
        parseFloat(element.style.getPropertyValue("--sheet-keyboard")) || 0;
      const available = Math.max(
        120,
        parentHeight - (bottom - previousKeyboard + keyboard) - 12,
      );
      const peek = Math.min(
        available,
        heading.current?.getBoundingClientRect().height || 180,
      );
      const total = peek + (content.current?.scrollHeight || available);
      const max = fillHeight
        ? available
        : Math.min(available, Math.max(peek, total));
      setSizes((previous) =>
        previous.peek === peek &&
        previous.max === max &&
        previous.keyboard === keyboard
          ? previous
          : { peek, max, keyboard },
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(parent);
    if (heading.current) observer?.observe(heading.current);
    if (content.current) observer?.observe(content.current);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [fillHeight]);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      (event.target as Element).closest(
        "a,input,select,textarea,button:not([data-sheet-grip])",
      )
    )
      return;
    dragged.current = false;
    const height =
      root.current?.getBoundingClientRect().height || heights[snap];
    gesture.current = { y: event.clientY, height, raw: height };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!gesture.current) return;
    const delta = gesture.current.y - event.clientY;
    if (Math.abs(delta) > 6) dragged.current = true;
    gesture.current.raw = gesture.current.height + delta;
    setDragHeight(
      Math.max(sizes.peek, Math.min(sizes.max, gesture.current.raw)),
    );
  }
  function end() {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    if (drag.raw < sizes.peek - 72) {
      setDragHeight(null);
      select("peek");
      onClose();
      return;
    }
    const nearest = SNAPS.reduce(
      (best, candidate) =>
        Math.abs(heights[candidate] - drag.raw) <
        Math.abs(heights[best] - drag.raw)
          ? candidate
          : best,
      snap,
    );
    select(nearest);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const index = SNAPS.indexOf(snap);
    const next =
      event.key === "End"
        ? "full"
        : event.key === "Home"
          ? "peek"
          : event.key === "ArrowUp"
            ? SNAPS[Math.min(2, index + 1)]
            : event.key === "ArrowDown"
              ? SNAPS[Math.max(0, index - 1)]
              : null;
    if (next) {
      event.preventDefault();
      select(next);
    }
  }
  return (
    <section
      id={id}
      ref={root}
      data-map-sheet
      role="region"
      aria-label={label}
      className={`${styles.sheet} ${className}`}
      data-snap={snap}
      data-expanded={snap !== "peek"}
      data-dragging={dragHeight !== null}
      style={
        {
          ...style,
          "--sheet-height": `${dragHeight ?? heights[snap]}px`,
          "--sheet-keyboard": `${sizes.keyboard}px`,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !(event.target as Element).closest("dialog")
        ) {
          event.stopPropagation();
          select("peek");
          onClose();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        ref={heading}
        className={styles.header}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          gesture.current = null;
          setDragHeight(null);
        }}
      >
        <button
          data-sheet-grip
          type="button"
          className={`${styles.grip} cp-focus`}
          aria-label="เลื่อนแผงข้อมูลขึ้นลง"
          aria-expanded={snap !== "peek"}
          aria-controls={contentId}
          onKeyDown={keyboard}
          onClick={(event) => {
            if (!dragged.current || event.detail === 0)
              select(SNAPS[(SNAPS.indexOf(snap) + 1) % 3]);
          }}
        >
          <span aria-hidden="true" />
        </button>
        {showClose && (
          <button
            type="button"
            className={`${styles.close} cp-focus`}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <AppIcon name="close" size={21} />
          </button>
        )}
        <div className={styles.summary}>{header}</div>
      </div>
      <div
        id={contentId}
        className={styles.body}
        inert={snap === "peek"}
        aria-hidden={snap === "peek"}
      >
        <div ref={content} className={styles.content}>
          {children}
        </div>
      </div>
    </section>
  );
}
