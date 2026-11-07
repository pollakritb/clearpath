"use client";
import MapBottomSheet from "@/frontend/components/app/MapBottomSheet";
import type { ReactNode } from "react";
import AppIcon from "@/frontend/components/ui/AppIcon";

/** One timeline shell shared by observation history and CAMS forecast. */
export default function MapTimelineControls({
  onClose,
  title,
  time,
  value,
  max,
  rangeLabel,
  valueText,
  startLabel,
  endLabel,
  playing,
  onPlay,
  onChange,
  onNow,
  disabled = false,
  summary,
  error,
  extra,
  info,
  endAction,
  footer,
  detail,
  leadingAction,
}: {
  onClose?: () => void;
  title: string;
  time: string;
  value: number;
  max: number;
  rangeLabel: string;
  valueText: string;
  startLabel: string;
  endLabel: string;
  playing: boolean;
  onPlay: () => void;
  onChange: (value: number) => void;
  onNow: () => void;
  disabled?: boolean;
  summary: string;
  error?: string | null;
  extra?: ReactNode;
  info?: ReactNode;
  endAction?: ReactNode;
  footer?: ReactNode;
  detail?: ReactNode;
  leadingAction?: ReactNode;
}) {
  return (
    <MapBottomSheet
      label={title}
      className="cp-timeline-sheet"
      initialSnap="full"
      onClose={onClose ?? onNow}
      showClose={false}
      header={
        <header className="cp-map-history-dock__heading">
          {leadingAction ?? (
            <span aria-hidden>
              <AppIcon name="clock" size={18} />
            </span>
          )}
          <div>
            <small>{title}</small>
            <strong>{time}</strong>
          </div>
          <button
            type="button"
            className="cp-map-history-dock__current cp-focus"
            onClick={onNow}
          >
            ตอนนี้
          </button>
          {endAction ?? (
            <button
              type="button"
              className="cp-station-time-close cp-focus"
              aria-label="ปิดแถบเวลา"
              onClick={onClose ?? onNow}
            >
              <AppIcon name="close" size={20} />
            </button>
          )}
        </header>
      }
    >
      <div className="cp-map-timeline__sub">
        <span role="status">{error ?? summary}</span>
        {extra}
        {info}
      </div>
      {detail}
      <div className="cp-map-timeline__slider">
        <button
          type="button"
          className="cp-focus"
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
      </div>
      <div className="cp-map-timeline__ends">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      {footer}
    </MapBottomSheet>
  );
}
