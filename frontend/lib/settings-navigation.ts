/** Only an internal page outside settings can be the settings exit. */
export function settingsOrigin(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value, "https://clearpath.invalid");
    if (
      url.origin !== "https://clearpath.invalid" ||
      url.pathname === "/settings" ||
      url.pathname.startsWith("/settings/")
    )
      return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

export function settingsHref(href: string, origin: string): string {
  const url = new URL(href, "https://clearpath.invalid");
  if (
    !url.pathname.startsWith("/members/") &&
    url.pathname !== "/admin" &&
    url.pathname !== "/profile" &&
    url.pathname !== "/settings" &&
    !url.pathname.startsWith("/settings/")
  )
    return href;
  url.searchParams.set("returnTo", settingsOrigin(origin) ?? "/");
  return url.pathname + url.search + url.hash;
}
