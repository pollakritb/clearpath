// leaflet.heat ไม่มี types ทางการ — ประกาศ minimal เอง
import "leaflet";

declare module "leaflet" {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }
  function heatLayer(
    latlngs: Array<[number, number, number]>,
    options?: HeatLayerOptions,
  ): import("leaflet").Layer;
}

declare module "leaflet.heat";
