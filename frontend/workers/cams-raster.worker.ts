import { renderCamsPixels } from "../lib/cams-raster";
import type { GridSurface } from "../types/ui";

self.onmessage = async (
  event: MessageEvent<{ id: number; surface: GridSurface }>,
) => {
  const { id, surface } = event.data;
  try {
    const canvas = new OffscreenCanvas(512, 960);
    const context = canvas.getContext("2d");
    if (!context) throw Error("Canvas unavailable");
    const image = context.createImageData(512, 960);
    image.data.set(renderCamsPixels(surface));
    context.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    self.postMessage({ id, blob });
  } catch {
    self.postMessage({ id, failed: true });
  }
};
