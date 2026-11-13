"use client";

import { useEffect } from "react";

/** Progressive enhancement: native materials remain usable without WebGL. */
export default function LiquidGlass() {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("@/frontend/lib/liquid-glass")
      .then(({ mountLiquidGlass }) => {
        if (!disposed) cleanup = mountLiquidGlass();
      })
      .catch(() => {
        // Native frosted material is the fallback when the renderer cannot load.
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return null;
}
