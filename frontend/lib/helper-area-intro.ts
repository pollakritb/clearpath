export const REQUEST_CREATED = "clearpath:measurement-request-created";
type IntroState = { choice: string; until: number; requestId?: string };
const memory = new Map<string, IntroState>();
const key = (account: string) => `clearpath:helper-area-intro:v1:${account}`;
export function shouldOfferHelperAreas(account: string, now = Date.now()) {
  try {
    const raw = localStorage.getItem(key(account));
    const saved = raw ? JSON.parse(raw) : memory.get(account);
    return (
      !saved ||
      !["setup", "later", "never"].includes(saved.choice) ||
      (saved.choice === "later" &&
        typeof saved.until === "number" &&
        saved.until <= now)
    );
  } catch {
    return (
      !memory.has(account) || (memory.get(account)?.until ?? Infinity) <= now
    );
  }
}
export function rememberHelperAreaIntro(
  account: string,
  choice: "setup" | "later" | "never",
  now = Date.now(),
  requestId?: string,
) {
  const value = {
    choice,
    requestId,
    until:
      choice === "later" ? now + 3 * 24 * 3600000 : Number.MAX_SAFE_INTEGER,
  };
  memory.set(account, value);
  try {
    localStorage.setItem(key(account), JSON.stringify(value));
  } catch {
    /* Session memory remains usable when storage is blocked. */
  }
}

/** A snoozed introduction returns on the next map visit after three days. */
export function deferredHelperAreaRequest(
  account: string,
  now = Date.now(),
): string | null {
  let saved: IntroState | undefined;
  try {
    const raw = localStorage.getItem(key(account));
    saved = raw ? JSON.parse(raw) : memory.get(account);
  } catch {
    saved = memory.get(account);
  }
  return saved?.choice === "later" &&
    saved.until <= now &&
    typeof saved.requestId === "string"
    ? saved.requestId
    : null;
}
