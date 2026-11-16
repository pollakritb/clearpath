"use client";

import type { ComponentProps } from "react";
import MapBottomSheet from "@/frontend/components/app/MapBottomSheet";
import AppIcon from "@/frontend/components/ui/AppIcon";
import type MapTimelineControls from "./MapTimelineControls";
import styles from "./CamsTimelineControls.module.css";

/** Swipe between a compact playback header and scrollable forecast details. */
export default function CamsTimelineControls({
  title,
  time,
  value,
  max,
  rangeLabel,
  valueText,
  playing,
  onPlay,
  onChange,
  onNow,
  disabled,
  summary,
  error,
  extra,
  info,
  endAction,
  footer,
  detail,
  compactAction,
  onClose,
}: ComponentProps<typeof MapTimelineControls>) {
  return (
    <MapBottomSheet
      label={title}
      className={styles.dock}
      onClose={onClose ?? onNow}
      showClose={false}
      mapClearance={140}
      header={
        <>
          <header className={styles.heading}>
            <div className={styles.time}>
              <span>พยากรณ์ · CAMS</span>
              <strong>{time}</strong>
            </div>
            {endAction}
          </header>
          <div className={styles.point}>{detail}</div>
          {max >= 0 && (
            <div className={styles.playback}>
              <button
                type="button"
                className={`${styles.play} cp-focus`}
                disabled={disabled}
                aria-label={playing ? `หยุดเล่น${title}` : `เล่น${title}`}
                onClick={onPlay}
              >
                <AppIcon name={playing ? "pause" : "play"} size={20} />
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, max)}
                value={value}
                disabled={max <= 0}
                aria-label={rangeLabel}
                aria-valuetext={valueText}
                onChange={(e) => onChange(Number(e.target.value))}
              />
              <button
                type="button"
                className={`${styles.now} cp-focus`}
                onClick={onNow}
              >
                ตอนนี้
              </button>
            </div>
          )}
          {!error && !summary.startsWith("CAMS ·") && (
            <p className={styles.notice} role="status">
              {summary}
            </p>
          )}
          {error && (
            <div className={styles.error}>
              <p role="alert">{error}</p>
              {compactAction}
            </div>
          )}
        </>
      }
    >
      <div className={styles.details}>
        {!error && (
          <div className={styles.day}>
            <span role="status">{summary}</span>
            {extra}
          </div>
        )}
        <h3>
          เกณฑ์สี PM2.5 <span>µg/m³</span>
        </h3>
        {footer}
        {info}
      </div>
    </MapBottomSheet>
  );
}
