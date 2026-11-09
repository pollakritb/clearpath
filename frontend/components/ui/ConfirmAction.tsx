"use client";
import { useState } from "react";

export default function ConfirmAction({
  label,
  description,
  onConfirm,
  disabled = false,
  className = "cp-focus",
}: {
  label: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
    );
  return (
    <div className="cp-confirm-action" role="group" aria-label={description}>
      <p>{description}</p>
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        ยืนยัน{label}
      </button>
      <button
        type="button"
        className="cp-focus"
        disabled={disabled}
        onClick={() => setConfirming(false)}
      >
        เก็บไว้
      </button>
    </div>
  );
}
