"use client";
import {
  useId,
  useEffect,
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
type Snap = "peek" | "full";

export default function MapBottomSheet({
  id,
  label,
  header,
  children,
  onClose,
  closeLabel = "ปิดแผงข้อมูล",
  className = "",
  style,
  initialSnap = "peek",
  onSnapChange,
  showClose = true,
  ownsFocus = false,
  mapClearance = 8,
  expandable = true,
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
  ownsFocus?: boolean;
  mapClearance?: number;
  expandable?: boolean;
}) {
  const contentId = useId();
  const root = useRef<HTMLElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    heading = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const sheet = root.current;
    if (!ownsFocus || !sheet) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const map = sheet.closest(".cp-map");
    const backgrounds = [...(map?.children ?? [])].filter(
      (child) => !child.contains(sheet) && child !== sheet,
    ) as HTMLElement[];
    const previous = backgrounds.map((element) => element.inert);
    backgrounds.forEach((element) => {
      element.inert = true;
    });
    if (!sheet.contains(document.activeElement))
      sheet.querySelector<HTMLElement>("input, button")?.focus();
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && sheet.getClientRects().length > 0) {
        event.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      backgrounds.forEach((element, i) => {
        element.inert = previous[i];
      });
      if (trigger?.isConnected && !trigger.closest("[inert]")) trigger.focus();
    };
  }, [ownsFocus]);
  const gesture = useRef<{
    y: number;
    height: number;
    raw: number;
    origin: Snap;
    touch?: boolean;
  } | null>(null);
  const dragged = useRef(false);
  const [snap, setSnap] = useState<Snap>(initialSnap),
    [dragHeight, setDragHeight] = useState<number | null>(null);
  const [sizes, setSizes] = useState({ peek: 180, max: 600, keyboard: 0 });
  const current = useRef({ snap, sizes });
  useLayoutEffect(() => {
    current.current = { snap, sizes };
  }, [snap, sizes]);
  function select(next: Snap) {
    if (!expandable) return;
    setSnap(next);
    setDragHeight(null);
    if (next === "peek" && scroll.current) scroll.current.scrollTop = 0;
    onSnapChange?.(next);
  }
  const finishRef = useRef(() => {});
  function finish() {
    const drag = gesture.current;
    if (!drag) return;
    gesture.current = null;
    const delta = drag.raw - drag.height;
    select(Math.abs(delta) > 32 ? (delta > 0 ? "full" : "peek") : drag.origin);
  }
  useLayoutEffect(() => {
    finishRef.current = finish;
  });
  useLayoutEffect(() => {
    const element = root.current,
      parent = element?.closest(".cp-map") ?? element?.parentElement;
    if (!element || !parent) return;
    const measure = () => {
      const height = parent.getBoundingClientRect().height;
      if (!height) return;
      const viewport = window.visualViewport;
      const keyboard = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      const previousKeyboard =
        parseFloat(element.style.getPropertyValue("--sheet-keyboard")) || 0;
      const bottom = parseFloat(getComputedStyle(element).bottom) || 84;
      const available = Math.max(
        120,
        height - (bottom - previousKeyboard + keyboard) - mapClearance,
      );
      const peek = Math.min(
        available,
        (heading.current?.getBoundingClientRect().height || 180) +
          (expandable ? 0 : (content.current?.scrollHeight ?? 0)),
      );
      const max = Math.min(
        available,
        Math.max(peek, peek + (content.current?.scrollHeight ?? 0)),
      );
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
  }, [mapClearance, expandable]);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element || !expandable) return;
    let startY = 0,
      startX = 0,
      allowed = false;
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const target = event.target as Element;
      allowed = !target.closest(
        "dialog,input,select,textarea,[data-sheet-no-drag]",
      );
      startY = event.touches[0].clientY;
      startX = event.touches[0].clientX;
      dragged.current = false;
    };
    const move = (event: TouchEvent) => {
      if (!allowed || event.touches.length !== 1) return;
      const delta = startY - event.touches[0].clientY;
      if (Math.abs(event.touches[0].clientX - startX) > Math.abs(delta)) return;
      const state = current.current;
      if (!gesture.current) {
        if (Math.abs(delta) < 8) return;
        // In full view, native scrolling owns upward gestures and downward gestures away from the top.
        if (state.snap === "full" && (delta > 0 || element.scrollTop > 1))
          return;
        gesture.current = {
          y: startY,
          height:
            root.current?.getBoundingClientRect().height ?? state.sizes.peek,
          raw: 0,
          origin: state.snap,
          touch: true,
        };
      }
      event.preventDefault();
      dragged.current = true;
      gesture.current.raw = gesture.current.height + delta;
      setDragHeight(
        Math.max(
          state.sizes.peek,
          Math.min(state.sizes.max, gesture.current.raw),
        ),
      );
    };
    const end = () => {
      allowed = false;
      if (gesture.current?.touch) finishRef.current();
    };
    const cancel = () => {
      allowed = false;
      gesture.current = null;
      setDragHeight(null);
    };
    element.addEventListener("touchstart", start, { passive: true });
    element.addEventListener("touchmove", move, { passive: false });
    element.addEventListener("touchend", end);
    element.addEventListener("touchcancel", cancel);
    return () => {
      element.removeEventListener("touchstart", start);
      element.removeEventListener("touchmove", move);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", cancel);
    };
  }, [expandable]);
  function start(event: PointerEvent<HTMLDivElement>) {
    if (
      !expandable ||
      event.pointerType === "touch" ||
      event.button !== 0 ||
      (event.target as Element).closest(
        "a,summary,input,select,textarea,button:not([data-sheet-grip]),dialog",
      )
    )
      return;
    if (snap === "full" && scroll.current && scroll.current.scrollTop > 1)
      return;
    dragged.current = false;
    const height =
      root.current?.getBoundingClientRect().height ||
      sizes[snap === "peek" ? "peek" : "max"];
    gesture.current = { y: event.clientY, height, raw: height, origin: snap };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!gesture.current || gesture.current.touch) return;
    const delta = gesture.current.y - event.clientY;
    if (Math.abs(delta) > 6) dragged.current = true;
    gesture.current.raw = gesture.current.height + delta;
    setDragHeight(
      Math.max(sizes.peek, Math.min(sizes.max, gesture.current.raw)),
    );
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (["End", "ArrowUp", "Home", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      select(event.key === "End" || event.key === "ArrowUp" ? "full" : "peek");
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
      data-snap={expandable ? snap : "fixed"}
      data-expanded={!expandable || snap === "full"}
      data-owns-focus={ownsFocus}
      data-dragging={dragHeight !== null}
      style={
        {
          ...style,
          "--sheet-height": `${dragHeight ?? (snap === "full" ? sizes.max : sizes.peek)}px`,
          "--sheet-keyboard": `${sizes.keyboard}px`,
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (ownsFocus && event.key === "Tab") {
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), a[href], select, textarea, summary, [tabindex='0']",
            ),
          ].filter(
            (element) =>
              element.getClientRects().length > 0 &&
              getComputedStyle(element).visibility !== "hidden" &&
              !element.closest("[inert]"),
          );
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (
          event.key === "Escape" &&
          !(event.target as Element).closest("dialog")
        ) {
          event.stopPropagation();
          onClose();
        }
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => {
        event.stopPropagation();
        if (snap === "peek" && event.deltaY > 10) select("full");
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div
        ref={scroll}
        className={styles.scroll}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={() => {
          gesture.current = null;
          setDragHeight(null);
        }}
        onClickCapture={(event) => {
          if (dragged.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
            dragged.current = false;
          }
        }}
      >
        <div ref={heading} className={styles.header}>
          {expandable && (
            <button
              data-sheet-grip
              type="button"
              className={`${styles.grip} cp-focus`}
              aria-label="เลื่อนแผงข้อมูลขึ้นลง"
              aria-expanded={snap === "full"}
              aria-controls={contentId}
              onKeyDown={keyboard}
              onClick={() => select(snap === "peek" ? "full" : "peek")}
            >
              <span aria-hidden="true" />
            </button>
          )}

          <div className={styles.summary}>{header}</div>
        </div>
        <div
          id={contentId}
          ref={content}
          className={styles.content}
          inert={expandable && snap === "peek"}
          aria-hidden={expandable && snap === "peek"}
        >
          {children}
        </div>
      </div>
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
    </section>
  );
}
