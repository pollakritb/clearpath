import { renderCamsPixelsAsync } from "./cams-raster";
import type { GridSurface } from "@/frontend/types/ui";

const images = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
const requests = new Map<
  number,
  {
    resolve: (blob: Blob) => void;
    reject: () => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let worker: Worker | null = null;
let failed = false,
  sequence = 0;
function offThread(surface: GridSurface): Promise<Blob> {
  if (
    failed ||
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined"
  )
    return Promise.reject();
  if (!worker) {
    worker = new Worker(
      new URL("../workers/cams-raster.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; blob?: Blob }>) => {
      const request = requests.get(data.id);
      requests.delete(data.id);
      if (request) clearTimeout(request.timer);
      if (data.blob) request?.resolve(data.blob);
      else request?.reject();
    };
    worker.onerror = () => {
      failed = true;
      worker?.terminate();
      worker = null;
      for (const request of requests.values()) {
        clearTimeout(request.timer);
        request.reject();
      }
      requests.clear();
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      requests.delete(id);
      reject();
    }, 10000);
    requests.set(id, { resolve, reject, timer });
    try {
      worker!.postMessage({ id, surface });
    } catch {
      clearTimeout(timer);
      requests.delete(id);
      reject();
    }
  });
}
async function fallback(surface: GridSurface): Promise<Blob> {
  const pixels = await renderCamsPixelsAsync(surface);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 960;
  const context = canvas.getContext("2d");
  if (!context) throw Error("Canvas unavailable");
  const image = context.createImageData(512, 960);
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(Error("Raster encoding failed")),
      "image/png",
    ),
  );
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(Error("Raster decoding failed"));
    reader.readAsDataURL(blob);
  });
}
const key = (surface: GridSurface) =>
  `${surface.generationId}:${surface.validAt}`;
export function cachedCamsRaster(surface: GridSurface): string | undefined {
  return images.get(key(surface));
}
/** Coalesce renders and retain eight compressed images. All expensive pixel work is asynchronous. */
export function prepareCamsRaster(surface: GridSurface): Promise<string> {
  const id = key(surface),
    hit = images.get(id);
  if (hit) return Promise.resolve(hit);
  const existing = pending.get(id);
  if (existing) return existing;
  const work = Promise.resolve()
    .then(() => offThread(surface))
    .catch(() => fallback(surface))
    .then(dataUrl)
    .then((url) => {
      // Decode before presentation so the old frame can stay visible until the replacement is ready.
      return new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(url);
        image.onerror = () => reject(Error("Raster decoding failed"));
        image.src = url;
      });
    })
    .then((url) => {
      images.set(id, url);
      while (images.size > 8) images.delete(images.keys().next().value!);
      return url;
    })
    .finally(() => pending.delete(id));
  pending.set(id, work);
  return work;
}
