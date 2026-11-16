/** One browser watch shared by the map, Today and signed-in alert presence.
 * Coordinates stay in memory; subscribers decide whether to persist a sample.
 */
interface Subscriber {
  position: PositionCallback;
  error?: PositionErrorCallback;
  pause?: () => void;
}
const subscribers = new Set<Subscriber>();
let watch: number | null = null;
let fallback: ReturnType<typeof setInterval> | null = null;
let generation = 0;
let latestTimestamp = 0;
let latestPosition: GeolocationPosition | null = null;

export function publishForegroundPosition(position: GeolocationPosition) {
  if (document.visibilityState === "hidden") return;
  if (Number.isFinite(position.timestamp)) {
    if (position.timestamp < latestTimestamp) return;
    latestTimestamp = position.timestamp;
  }
  latestPosition = position;
  for (const subscriber of subscribers) subscriber.position(position);
}
function stop() {
  generation++;
  if (watch !== null) navigator.geolocation?.clearWatch(watch);
  if (fallback !== null) clearInterval(fallback);
  watch = null;
  fallback = null;
}
function start() {
  if (
    !subscribers.size ||
    document.visibilityState === "hidden" ||
    watch !== null ||
    fallback !== null ||
    !navigator.geolocation
  )
    return;
  const cycle = ++generation;
  const position: PositionCallback = (value) => {
    if (cycle === generation) publishForegroundPosition(value);
  };
  const error: PositionErrorCallback = (value) => {
    if (cycle === generation)
      for (const subscriber of subscribers) subscriber.error?.(value);
  };
  const options = { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 };
  if (typeof navigator.geolocation.watchPosition === "function") {
    watch = navigator.geolocation.watchPosition(position, error, options);
  } else {
    const sample = () =>
      navigator.geolocation.getCurrentPosition(position, error, options);
    fallback = setInterval(sample, 30000);
    sample();
  }
}
function pause() {
  for (const subscriber of subscribers) subscriber.pause?.();
  stop();
}
function visibility() {
  if (document.visibilityState === "hidden") pause();
  else start();
}
export function subscribeForegroundLocation(subscriber: Subscriber) {
  subscribers.add(subscriber);
  if (
    document.visibilityState !== "hidden" &&
    latestPosition &&
    Date.now() - latestPosition.timestamp >= 0 &&
    Date.now() - latestPosition.timestamp < 30000
  )
    subscriber.position(latestPosition);
  if (subscribers.size === 1) {
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", visibility);
  }
  start();
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size) {
      latestTimestamp = 0;
      latestPosition = null;
      stop();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", visibility);
    }
  };
}
