import type { CSSProperties } from "react";

import { T } from "@/frontend/lib/ui";

export const FORM_CONTROL_STYLE: CSSProperties = {
  width: "100%",
  minHeight: "44px",
  border: `1px solid ${T.line}`,
  borderRadius: "10px",
  background: T.input,
  color: T.ink,
  padding: ".65em .75em",
  fontFamily: "inherit",
};
