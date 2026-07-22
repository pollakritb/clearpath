"use client";

import { T } from "@/frontend/lib/ui";

export interface LayerItem {
  key: string;
  label: string;
  dot: string; // สี/แถบสีไอคอนหน้า label
  on: boolean;
  onToggle: () => void;
  note?: string | null; // ข้อความเตือนใต้รายการ (เช่น ยังไม่ตั้ง FIRMS key)
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: "2.4em",
        height: "1.35em",
        flex: "none",
        borderRadius: "99px",
        background: on ? T.teal : "#cdd3d1",
        position: "relative",
        transition: "background .2s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: "2px",
          left: on ? "calc(100% - 1.05em - 2px)" : "2px",
          width: "1.05em",
          height: "1.05em",
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.3)",
          transition: "left .2s",
        }}
      />
    </span>
  );
}

export default function LayerToggles({ items }: { items: LayerItem[] }) {
  return (
    <section
      aria-label="เลเยอร์แผนที่"
      style={{ borderTop: `1px solid ${T.line}`, paddingTop: "1em" }}
    >
      <h2 style={{ margin: "0 0 .55em", fontSize: ".92em", fontWeight: 700 }}>
        เลเยอร์
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: ".15em" }}>
        {items.map((ly) => (
          <div key={ly.key}>
            <button
              type="button"
              onClick={ly.onToggle}
              className="cp-focus"
              role="switch"
              aria-checked={ly.on}
              style={{
                display: "flex",
                alignItems: "center",
                gap: ".65em",
                minHeight: "44px",
                padding: ".4em .5em",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                borderRadius: "9px",
                textAlign: "left",
                width: "100%",
                color: T.ink,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: "1.1em",
                  height: "1.1em",
                  flex: "none",
                  borderRadius: "5px",
                  background: ly.dot,
                }}
              />
              <span style={{ flex: 1, fontSize: ".86em", fontWeight: 500 }}>
                {ly.label}
              </span>
              <Switch on={ly.on} />
            </button>
            {ly.note && (
              <div
                style={{
                  fontSize: ".74em",
                  color: "#c2433a",
                  margin: ".1em 0 .3em",
                  paddingLeft: ".5em",
                }}
              >
                {ly.note}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
