"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import AQICard from "@/frontend/components/panels/AQICard";
import Header from "@/frontend/components/panels/Header";
import LayerToggles from "@/frontend/components/panels/LayerToggles";
import Legend from "@/frontend/components/panels/Legend";
import ListView from "@/frontend/components/panels/ListView";
import ModelAccuracy from "@/frontend/components/panels/ModelAccuracy";
import RoutePanel from "@/frontend/components/panels/RoutePanel";
import SearchBox from "@/frontend/components/panels/SearchBox";
import { useFirms } from "@/frontend/hooks/useFirms";
import { useHistory } from "@/frontend/hooks/useHistory";
import { usePm25 } from "@/frontend/hooks/usePm25";
import { useRouteCompare } from "@/frontend/hooks/useRouteCompare";
import { useValidation } from "@/frontend/hooks/useValidation";
import { useWeather } from "@/frontend/hooks/useWeather";
import { T } from "@/frontend/lib/ui";
import type { Coordinate, RouteCompareRequest, Station } from "@/frontend/types";

const MapView = dynamic(() => import("@/frontend/components/map/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" style={{ color: T.subInk }}>
      กำลังโหลดแผนที่…
    </div>
  ),
});

type Snap = "peek" | "half" | "full";
const SHEET_Y: Record<Snap, string> = { peek: "82%", half: "45%", full: "2%" };

export default function Home() {
  const pm25 = usePm25();
  const route = useRouteCompare();
  const weather = useWeather();
  const firms = useFirms();
  const history = useHistory();
  const validation = useValidation();

  // a11y
  const [bigText, setBigText] = useState(false);
  const [contrast, setContrast] = useState(false);

  // route planning (พิกัดล้วน — autocomplete/แตะแผนที่ ตั้งหมุดให้เลย)
  const [startPin, setStartPin] = useState<Coordinate | null>(null);
  const [endPin, setEndPin] = useState<Coordinate | null>(null);
  const [activeField, setActiveField] = useState<"start" | "end">("start");
  const [method, setMethod] = useState<"idw" | "kriging">("idw");
  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showStations, setShowStations] = useState(true);
  const [showFires, setShowFires] = useState(false);

  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [snap, setSnap] = useState<Snap>("half");

  // โหลดจุดไฟไหม้ครั้งแรกเมื่อเปิด layer
  useEffect(() => {
    if (showFires && !firms.loaded && !firms.loading) firms.load(1);
  }, [showFires, firms]);

  const applyPlace = useCallback(
    (c: Coordinate, field: "start" | "end") => {
      if (field === "start") {
        setStartPin(c);
        setActiveField("end");
      } else {
        setEndPin(c);
        setActiveField("start");
      }
    },
    [],
  );

  const onMapClick = useCallback(
    (lat: number, lon: number) => {
      applyPlace({ lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }, activeField);
    },
    [activeField, applyPlace],
  );

  const onSelectPlace = useCallback(
    (c: Coordinate) => applyPlace(c, activeField),
    [activeField, applyPlace],
  );

  const onSelectStation = useCallback(
    (s: Station) => {
      setSelectedStation(s);
      setShowHistory(false);
      weather.load(s.lat, s.lon);
      setSnap("half");
    },
    [weather],
  );

  const onToggleHistory = useCallback(() => {
    setShowHistory((prev) => {
      const next = !prev;
      if (next && selectedStation) history.load(selectedStation.id, 24);
      return next;
    });
  }, [selectedStation, history]);

  const runCompare = useCallback(
    async (m: "idw" | "kriging") => {
      if (!startPin || !endPin) return;
      const req: RouteCompareRequest = {
        method: m,
        start_lat: startPin.lat,
        start_lon: startPin.lon,
        end_lat: endPin.lat,
        end_lon: endPin.lon,
      };
      const res = await route.compare(req);
      if (res) {
        setStartPin(res.start);
        setEndPin(res.end);
        setSelectedRouteId(res.recommended_id);
        setSnap("full");
      }
    },
    [startPin, endPin, route],
  );

  const onCompare = useCallback(() => runCompare(method), [runCompare, method]);

  // สลับ IDW/Kriging — ถ้ามีผลอยู่แล้ว คำนวณใหม่ด้วยวิธีใหม่ทันที (ให้เห็นความต่าง)
  const onMethodChange = useCallback(
    (m: "idw" | "kriging") => {
      setMethod(m);
      if (route.data) void runCompare(m);
    },
    [route.data, runCompare],
  );

  const onSwap = useCallback(() => {
    setStartPin(endPin);
    setEndPin(startPin);
  }, [startPin, endPin]);

  const cycleSnap = () =>
    setSnap((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"));

  const heatDot = "linear-gradient(90deg,#27ae60,#e67e22,#8e44ad)";
  const layerItems = [
    {
      key: "heat",
      label: "Heatmap PM2.5",
      dot: heatDot,
      on: showHeatmap,
      onToggle: () => setShowHeatmap((v) => !v),
    },
    {
      key: "stations",
      label: "สถานีวัด",
      dot: T.teal,
      on: showStations,
      onToggle: () => setShowStations((v) => !v),
    },
    {
      key: "firms",
      label: `จุดไฟไหม้ (FIRMS)${firms.loading ? " …" : firms.loaded ? ` · ${firms.fires.length}` : ""}`,
      dot: "#ff5722",
      on: showFires,
      onToggle: () => setShowFires((v) => !v),
      note: firms.error,
    },
  ];

  const rootStyle = {
    fontSize: bigText ? "18px" : "15px",
    lineHeight: 1.45,
    fontFamily: "var(--font-noto-thai), system-ui, sans-serif",
    "--cp-aside-w": bigText ? "420px" : "380px",
    "--cp-sheet-y": SHEET_Y[snap],
  } as React.CSSProperties;

  const sidebarContent = (
    <div
      className="cp-scroll"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "1.1em 1.25em 1.6em",
        display: "flex",
        flexDirection: "column",
        gap: "1.1em",
      }}
    >
      <SearchBox
        startText={startPin?.label ?? ""}
        endText={endPin?.label ?? ""}
        activeField={activeField}
        onActiveFieldChange={setActiveField}
        onSelectPlace={onSelectPlace}
        method={method}
        onMethodChange={onMethodChange}
        onSwap={onSwap}
        onCompare={onCompare}
        comparing={route.loading}
        canCompare={!!startPin && !!endPin}
      />

      {route.error && (
        <div
          role="alert"
          className="cp-anim-rise"
          style={{
            display: "flex",
            gap: ".7em",
            alignItems: "flex-start",
            background: "rgba(224,85,75,.08)",
            border: "1px solid rgba(224,85,75,.35)",
            borderRadius: "11px",
            padding: ".8em .9em",
          }}
        >
          <span
            aria-hidden
            style={{
              width: "1.5em",
              height: "1.5em",
              flex: "none",
              borderRadius: "7px",
              background: T.red,
              color: "#fff",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: ".9em",
            }}
          >
            !
          </span>
          <div style={{ flex: 1, fontSize: ".82em" }}>
            <div style={{ fontWeight: 700, color: "#c2433a" }}>เปรียบเทียบเส้นทางไม่สำเร็จ</div>
            <div style={{ color: T.subInk, marginTop: ".15em" }}>{route.error}</div>
          </div>
          <button
            type="button"
            onClick={() => route.reset()}
            aria-label="ปิด"
            className="cp-focus"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: T.subInk,
              fontSize: "1.1em",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {route.data && (
        <RoutePanel
          data={route.data}
          selectedId={selectedRouteId ?? route.data.recommended_id}
          onSelectRoute={setSelectedRouteId}
          onHoverRoute={setHoveredRouteId}
        />
      )}

      <AQICard
        station={selectedStation}
        weather={weather.data}
        weatherLoading={weather.loading}
        showHistory={showHistory}
        onToggleHistory={onToggleHistory}
        historyPoints={history.points}
        historyLoading={history.loading}
      />

      <LayerToggles items={layerItems} />

      <ModelAccuracy
        data={validation.data}
        loading={validation.loading}
        error={validation.error}
        onLoad={validation.load}
      />
    </div>
  );

  const viewToggle = (
    <div
      className="cp-viewtoggle"
      style={{
        position: "absolute",
        top: "1em",
        left: "1em",
        zIndex: 1200,
        display: "flex",
        background: "rgba(255,255,255,.9)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,.7)",
        borderRadius: "11px",
        boxShadow: "0 4px 16px rgba(0,0,0,.14)",
        padding: ".25em",
      }}
    >
      {(["map", "list"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setViewMode(v)}
          className="cp-focus"
          aria-pressed={viewMode === v}
          style={{
            display: "flex",
            alignItems: "center",
            gap: ".35em",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: ".8em",
            fontWeight: 700,
            padding: ".45em .8em",
            borderRadius: "8px",
            minHeight: "40px",
            background: viewMode === v ? T.teal : "transparent",
            color: viewMode === v ? "#fff" : T.subInk,
          }}
        >
          <span aria-hidden>{v === "map" ? "🗺" : "☰"}</span>
          {v === "map" ? "แผนที่" : "รายการ"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="cp-app" data-contrast={contrast} style={rootStyle}>
      {/* ============ SIDEBAR (desktop column / mobile bottom sheet) ============ */}
      <aside className="cp-aside cp-scroll">
        {/* mobile grabber */}
        <button
          type="button"
          onClick={cycleSnap}
          aria-label="ปรับขนาดแผงข้อมูล"
          className="cp-grabber cp-focus"
          style={{
            border: "none",
            background: "transparent",
            padding: ".7em 0 .5em",
            justifyContent: "center",
            cursor: "grab",
            flex: "none",
          }}
        >
          <span style={{ width: "42px", height: "5px", borderRadius: "99px", background: "#cdd3d1" }} />
        </button>

        <div className="cp-header">
          <Header
            stationCount={pm25.stations.length}
            updatedAt={pm25.updatedAt}
            loading={pm25.loading}
            error={pm25.error}
            bigText={bigText}
            contrast={contrast}
            onToggleBigText={() => setBigText((v) => !v)}
            onToggleContrast={() => setContrast((v) => !v)}
          />
        </div>

        {sidebarContent}
      </aside>

      {/* ============ MAP ============ */}
      <main className="cp-map">
        <MapView
          stations={showStations || showHeatmap ? pm25.stations : []}
          routeData={route.data}
          fires={showFires ? firms.fires : []}
          startPin={startPin}
          endPin={endPin}
          showHeatmap={showHeatmap}
          showStations={showStations}
          hoveredRouteId={hoveredRouteId}
          selectedRouteId={selectedRouteId ?? route.data?.recommended_id ?? null}
          onMapClick={onMapClick}
          onSelectStation={onSelectStation}
          onLocate={(lat, lon) =>
            applyPlace({ lat, lon, label: `ตำแหน่งฉัน (${lat.toFixed(3)}, ${lon.toFixed(3)})` }, "start")
          }
        />

        {viewToggle}

        <div className="cp-legend-wrap">
          <Legend />
        </div>

        {/* mobile floating brand pill */}
        <div
          className="cp-brandpill"
          style={{
            position: "absolute",
            top: "1em",
            left: "1em",
            right: "1em",
            zIndex: 1100,
            alignItems: "center",
            gap: ".55em",
            background: "rgba(255,255,255,.9)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            border: "1px solid rgba(255,255,255,.7)",
            borderRadius: "14px",
            boxShadow: "0 4px 16px rgba(0,0,0,.14)",
            padding: ".55em .7em",
          }}
        >
          <div
            aria-hidden
            style={{
              width: "30px",
              height: "30px",
              flex: "none",
              borderRadius: "9px",
              background: T.brandGrad,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "13px",
                height: "13px",
                border: "2.5px solid #fff",
                borderRadius: "50%",
                borderTopColor: "transparent",
                transform: "rotate(-45deg)",
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: "15px", color: "#1a2826" }}>
            ClearPath
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: ".3em", fontSize: "11px", color: "#5a6664" }}>
            <span
              className="cp-anim-pulse"
              aria-hidden
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: T.green,
                boxShadow: "0 0 0 3px rgba(43,191,115,.18)",
              }}
            />
            <span style={{ fontFamily: T.mono, fontWeight: 600 }}>
              {pm25.loading ? "…" : pm25.stations.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBigText((v) => !v)}
            aria-label="สลับขนาดตัวอักษรใหญ่"
            aria-pressed={bigText}
            className="cp-focus"
            style={{
              width: "32px",
              height: "32px",
              border: `1px solid ${T.line}`,
              background: bigText ? T.teal : "#fff",
              color: bigText ? "#fff" : "#1a2826",
              borderRadius: "8px",
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            ก
          </button>
          <button
            type="button"
            onClick={() => setContrast((v) => !v)}
            aria-label="สลับโหมดคอนทราสต์สูง"
            aria-pressed={contrast}
            className="cp-focus"
            style={{
              width: "32px",
              height: "32px",
              border: `1px solid ${T.line}`,
              background: contrast ? "#1a2826" : "#fff",
              borderRadius: "8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              aria-hidden
              style={{
                width: "15px",
                height: "15px",
                borderRadius: "50%",
                background: `linear-gradient(90deg, ${contrast ? "#fff" : "#1a2826"} 50%, transparent 50%)`,
                border: `1.5px solid ${contrast ? "#fff" : "#1a2826"}`,
              }}
            />
          </button>
        </div>

        {viewMode === "list" && (
          <ListView
            stations={pm25.stations}
            routeData={route.data}
            onSelectStation={onSelectStation}
          />
        )}
      </main>
    </div>
  );
}
