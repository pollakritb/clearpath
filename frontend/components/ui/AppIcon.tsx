import type { SVGProps } from "react";

export type AppIconName =
  | "activity"
  | "admin"
  | "alert"
  | "back"
  | "camera"
  | "calibration"
  | "check"
  | "chevron"
  | "copy"
  | "community"
  | "community-station"
  | "database"
  | "home"
  | "map"
  | "megaphone"
  | "menu"
  | "model"
  | "close"
  | "layers"
  | "line"
  | "search"
  | "send"
  | "sensor"
  | "station"
  | "report"
  | "settings"
  | "shield"
  | "sparkles"
  | "location"
  | "user";

interface AppIconProps extends SVGProps<SVGSVGElement> {
  name: AppIconName;
  size?: number;
}

export default function AppIcon({ name, size = 20, ...props }: AppIconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      {...props}
      {...common}
    >
      {name === "home" && (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9v11h14V9M9 20v-6h6v6" />
        </>
      )}
      {name === "map" && (
        <>
          <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
          <path d="M9 3v15M15 6v15" />
        </>
      )}
      {name === "report" && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M9 3.5h6M12 8v8M8 12h8" />
        </>
      )}
      {name === "camera" && (
        <>
          <rect x="3" y="6" width="18" height="14" rx="3" />
          <path d="m8 6 1.5-2h5L16 6" />
          <circle cx="12" cy="13" r="3.5" />
        </>
      )}
      {name === "location" && (
        <>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
      {name === "community" && (
        <>
          <path d="M16 20v-1.7A3.3 3.3 0 0 0 12.7 15H6.3A3.3 3.3 0 0 0 3 18.3V20" />
          <circle cx="9.5" cy="8.5" r="3.5" />
          <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M21 20v-1.7a3.3 3.3 0 0 0-2.5-3.2" />
        </>
      )}
      {name === "admin" && (
        <>
          <path d="M12 3 4.5 6v5c0 4.7 3.2 8.3 7.5 10 4.3-1.7 7.5-5.3 7.5-10V6Z" />
          <path d="m8.7 12 2.1 2.1 4.5-4.5" />
        </>
      )}
      {name === "database" && (
        <>
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </>
      )}
      {name === "activity" && <path d="M3 12h4l2-7 4 14 2-7h6" />}
      {name === "megaphone" && (
        <>
          <path d="M4 13v-2l13-5v12Z" />
          <path d="M7 14.2 8.5 21H12l-1.4-8M19 9v6" />
        </>
      )}
      {name === "model" && (
        <>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="6" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="m7.8 7.2 3 8.8M16.2 7.2l-3 8.8M8 6h8" />
        </>
      )}
      {name === "shield" && (
        <>
          <path d="M12 3 5 6v5c0 4.2 2.8 7.5 7 9 4.2-1.5 7-4.8 7-9V6Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === "settings" && (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </>
      )}
      {name === "layers" && (
        <>
          <path d="m12 3 9 5-9 5-9-5Z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
        </>
      )}
      {name === "station" && (
        <>
          <path d="M5 21V9l7-5 7 5v12" />
          <path d="M3 21h18M9 13h6M9 17h6" />
          <circle cx="12" cy="9" r="1" />
        </>
      )}
      {name === "sensor" && (
        <>
          <rect x="5" y="4" width="14" height="16" rx="3" />
          <path d="M8 8h8M8 12h5M8 16h3" />
          <circle cx="16" cy="16" r="1.4" />
        </>
      )}
      {name === "community-station" && (
        <>
          <rect x="7" y="6" width="10" height="14" rx="2.5" />
          <path d="M10 10h4M10 14h2M12 6V3" />
          <path d="M8.5 3.8a5 5 0 0 0-2.3 2.4M15.5 3.8a5 5 0 0 1 2.3 2.4" />
          <circle cx="14" cy="16" r="1" />
        </>
      )}
      {name === "line" && (
        <>
          <path d="M20 11.3c0 4-3.6 7.2-8 7.2-.6 0-1.2-.1-1.8-.2L6 20l1.1-3.1C5.2 15.6 4 13.6 4 11.3c0-4 3.6-7.3 8-7.3s8 3.3 8 7.3Z" />
          <path d="M8 9v4h2M11 9v4M13 13V9l3 4V9" />
        </>
      )}
      {name === "copy" && (
        <>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </>
      )}
      {name === "send" && (
        <>
          <path d="m3 11 18-8-7.5 18-3-7Z" />
          <path d="m10.5 14 4-4" />
        </>
      )}
      {name === "calibration" && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v2M7 12h2M15 12h2M12 15v2" />
          <path d="m9.5 12 1.7 1.7 3.5-4" />
        </>
      )}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {name === "user" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      )}
      {name === "alert" && (
        <>
          <path d="M12 3 2.7 20h18.6Z" />
          <path d="M12 9v5M12 17.5h.01" />
        </>
      )}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "chevron" && <path d="m9 18 6-6-6-6" />}
      {name === "back" && <path d="m15 18-6-6 6-6" />}
      {name === "menu" && <path d="M4 7h16M4 12h16M4 17h16" />}
      {name === "sparkles" && (
        <>
          <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" />
          <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" />
        </>
      )}
    </svg>
  );
}
