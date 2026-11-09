/** Private drafts stay in this tab's memory only; never persist images or GPS. */
let generation = 0;
export const privateDraftGeneration = () => generation;
const drafts = new Map<
  string,
  { value: unknown; expiresAt: number; timer: ReturnType<typeof setTimeout> }
>();
export function readPrivateDraft<T>(key: string): T | null {
  const entry = drafts.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    removePrivateDraft(key);
    return null;
  }
  return entry.value as T;
}
export function writePrivateDraft<T>(
  key: string,
  value: T,
  expiresAt = Date.now() + 30 * 60_000,
) {
  removePrivateDraft(key);
  const timer = setTimeout(
    () => removePrivateDraft(key),
    Math.max(0, expiresAt - Date.now()),
  );
  drafts.set(key, { value, expiresAt, timer });
  if (drafts.size > 8) removePrivateDraft(drafts.keys().next().value!);
}
export function removePrivateDraft(key: string) {
  const entry = drafts.get(key);
  if (entry) clearTimeout(entry.timer);
  drafts.delete(key);
}
export function clearPrivateDrafts() {
  generation++;
  for (const key of drafts.keys()) removePrivateDraft(key);
}
