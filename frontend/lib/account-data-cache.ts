/** Browser memory only. Account data never goes into public cache or storage. */
export interface AccountSnapshot<T> {
  data?: T;
  error?: Error;
  pending?: Promise<T>;
  updatedAt: number;
}
const EMPTY: AccountSnapshot<never> = { updatedAt: 0 };
const entries = new Map<string, AccountSnapshot<unknown>>();
const listeners = new Set<() => void>();
let generation = 0;
const TTL = 60_000;
const TIMEOUT = 15_000;
export const accountDataGeneration = () => generation;
export const accountKey = (owner: string, resource: string) =>
  JSON.stringify([owner, resource]);
export const emptyAccountSnapshot = () => EMPTY;
export function accountSnapshot<T>(key: string): AccountSnapshot<T> {
  return (entries.get(key) ?? EMPTY) as AccountSnapshot<T>;
}
export function subscribeAccountData(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(key: string, value: AccountSnapshot<unknown>) {
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > 60) {
    const oldest = [...entries].find(
      ([k, entry]) => k !== key && !entry.pending,
    )?.[0];
    if (oldest) entries.delete(oldest);
  }
  listeners.forEach((listener) => listener());
}
export function updateAccountData<T>(
  key: string,
  update: T | ((previous: T | undefined) => T | undefined),
) {
  const previous = accountSnapshot<T>(key);
  const data =
    typeof update === "function"
      ? (update as (p: T | undefined) => T | undefined)(previous.data)
      : update;
  if (data !== undefined) publish(key, { data, updatedAt: Date.now() });
}
export function clearAccountData() {
  generation++;
  entries.clear();
  listeners.forEach((listener) => listener());
}
export function loadAccountData<T>(
  key: string,
  loader: () => Promise<T>,
  force = false,
): Promise<T> {
  const previous = accountSnapshot<T>(key);
  if (previous.pending) return previous.pending;
  if (
    !force &&
    previous.data !== undefined &&
    Date.now() - previous.updatedAt < TTL
  )
    return Promise.resolve(previous.data);
  const version = generation;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("โหลดข้อมูลนานเกินไป กรุณาลองอีกครั้ง")),
      TIMEOUT,
    );
  });
  const pending = Promise.race([Promise.resolve().then(loader), timeout])
    .then((data) => {
      if (version === generation && accountSnapshot(key).pending === pending)
        publish(key, { data, updatedAt: Date.now() });
      return data;
    })
    .catch((error: unknown) => {
      if (version === generation && accountSnapshot(key).pending === pending)
        publish(key, {
          data: previous.data,
          updatedAt: previous.updatedAt,
          error:
            error instanceof Error ? error : new Error("โหลดข้อมูลไม่สำเร็จ"),
        });
      throw error;
    })
    .finally(() => clearTimeout(timer));
  publish(key, { ...previous, error: undefined, pending });
  return pending;
}
