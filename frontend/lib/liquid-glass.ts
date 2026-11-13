import Container from "@/vendor/liquid-glass-js/container";

// One upstream WebGL context renders every visible map overlay. Each overlay
// receives a passive 2D copy, avoiding the browser's per-page WebGL context cap.
class SharedGlass extends Container {
  point = { x: 0, y: 0 };

  init() {
    this.createElement();
    this.setupCanvas();
  }

  getPosition() {
    return this.point;
  }

  startRenderLoop() {
    // Demand-driven; no global scroll listener or perpetual animation loop.
  }

  prepare(target: HTMLElement) {
    const box = target.getBoundingClientRect();
    this.width = Math.ceil(box.width);
    this.height = Math.ceil(box.height);
    this.point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const radius = getComputedStyle(target).borderTopLeftRadius;
    this.borderRadius = Math.min(
      this.width / 2,
      this.height / 2,
      radius.endsWith("%") ? this.height / 2 : parseFloat(radius) || 0,
    );
    // DOM text stays full resolution; only the blurred background is downsampled.
    this.canvas.width = Math.max(1, Math.ceil(this.width * 0.75));
    this.canvas.height = Math.max(1, Math.ceil(this.height * 0.75));
  }

  draw(snapshot: MapSnapshot, target: HTMLElement, upload: boolean) {
    this.prepare(target);
    if (!this.webglInitialized) {
      this.setupShader(snapshot.canvas);
      this.webglInitialized = true;
    }
    const {
      gl,
      texture,
      textureSizeLoc,
      scrollYLoc,
      containerPositionLoc,
      resolutionLoc,
      borderRadiusLoc,
    } = this.gl_refs;
    if (!gl || !texture) return false;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(resolutionLoc, this.width, this.height);
    gl.uniform1f(borderRadiusLoc, this.borderRadius);
    gl.uniform1f(scrollYLoc, 0);
    gl.uniform2f(
      containerPositionLoc,
      this.point.x - snapshot.left,
      this.point.y - snapshot.top,
    );
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (upload)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        snapshot.canvas,
      );
    gl.uniform2f(textureSizeLoc, snapshot.canvas.width, snapshot.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }
}

const OVERLAYS = [
  ".cp-map-topbar",
  ".cp-map-action",
  ".cp-mapctrls__zoom",
  ".cp-mapctrls__overview",
  ".cp-mapctrls__locate",
  ".cp-map-request-button",
  "[data-map-sheet]",
  ".cp-map-history-dock",
  ".cp-map-current-dock",
  ".cp-cams-dock",
  ".cp-helper-editor[data-step=map] .cp-helper-editor__header > button",
  ".cp-request-location-back",
  ".cp-request-location-search",
].join(",");

type Surface = {
  layer: HTMLSpanElement;
  canvas: HTMLCanvasElement;
  position: string;
  positioned: boolean;
};

type MapSnapshot = { canvas: HTMLCanvasElement; left: number; top: number };

function visible(target: HTMLElement) {
  const box = target.getBoundingClientRect();
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.bottom > 0 &&
    box.top < innerHeight &&
    box.right > 0 &&
    box.left < innerWidth &&
    getComputedStyle(target).visibility !== "hidden" &&
    !target.closest("[hidden],[inert]")
  );
}

function mapSnapshot(map: HTMLElement): MapSnapshot | null {
  const snapshot = document.createElement("canvas");
  const frame = document
    .querySelector(".cp-mobile-frame")
    ?.getBoundingClientRect();
  if (!frame || frame.width <= 0 || frame.height <= 0) return null;
  snapshot.width = Math.ceil(frame.width);
  snapshot.height = Math.ceil(Math.min(frame.height, innerHeight));
  const context = snapshot.getContext("2d");
  if (!context) return null;
  const area = map.getBoundingClientRect();
  context.fillStyle = "#e6eeeb";
  context.fillRect(0, 0, snapshot.width, snapshot.height);
  context.save();
  context.translate(-frame.left, -frame.top);
  context.beginPath();
  // Extend the last row of map pixels underneath the fixed navigation bar.
  context.rect(area.left, area.top, area.width, area.height);
  context.clip();
  context.fillStyle = "#e9e6df";
  context.fillRect(area.left, area.top, area.width, area.height);
  let tiles = 0;
  for (const image of map.querySelectorAll<HTMLImageElement>(
    "img.leaflet-tile-loaded",
  )) {
    if (
      !image.complete ||
      !image.naturalWidth ||
      image.crossOrigin !== "anonymous"
    )
      continue;
    const box = image.getBoundingClientRect();
    if (
      box.right < area.left ||
      box.left > area.right ||
      box.bottom < area.top ||
      box.top > area.bottom
    )
      continue;
    context.drawImage(image, box.left, box.top, box.width, box.height);
    tiles++;
  }
  context.restore();
  if (!tiles) return null;
  const bottom = Math.min(snapshot.height, area.bottom - frame.top);
  if (bottom < snapshot.height && bottom > 1) {
    context.drawImage(
      snapshot,
      area.left - frame.left,
      bottom - 2,
      area.width,
      2,
      area.left - frame.left,
      bottom,
      area.width,
      snapshot.height - bottom,
    );
  }
  return { canvas: snapshot, left: frame.left, top: frame.top };
}

export function mountLiquidGlass(): () => void {
  const preference = matchMedia(
    "(prefers-reduced-transparency: reduce), (forced-colors: active)",
  );
  const renderer = new SharedGlass({ tintOpacity: 0.14 });
  const surfaces = new Map<HTMLElement, Surface>();
  let disposed = false;
  let unavailable = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const remove = (target: HTMLElement, surface: Surface) => {
    surface.layer.remove();
    delete target.dataset.liquidSurface;
    if (surface.positioned && target.style.position === "relative")
      target.style.position = surface.position;
    resize.unobserve(target);
    surfaces.delete(target);
  };
  const fallback = () => {
    for (const [target, surface] of surfaces) remove(target, surface);
  };
  const refresh = () => {
    timer = undefined;
    if (disposed || document.hidden || unavailable) return;
    if (preference.matches) {
      fallback();
      return;
    }
    if (!renderer.gl || renderer.gl.isContextLost()) {
      fallback();
      return;
    }
    for (const [target, surface] of surfaces) {
      if (
        !target.isConnected ||
        !visible(target) ||
        surface.layer.parentElement !== target
      )
        remove(target, surface);
    }
    const topDialog = [
      ...document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
    ].at(-1);
    // Native dialogs without maps and full-page search own an opaque reading
    // surface. Never project the hidden map through their fields or controls.
    const map = topDialog
      ? topDialog.querySelector<HTMLElement>(".leaflet-container")
      : document.querySelector(".cp-request-search-screen")
        ? null
        : [
            ...document.querySelectorAll<HTMLElement>(".leaflet-container"),
          ].find(visible);
    if (!map) {
      fallback();
      return;
    }
    let snapshot: MapSnapshot | null;
    try {
      snapshot = mapSnapshot(map);
    } catch {
      fallback();
      return;
    }
    if (!snapshot) {
      fallback();
      return;
    }
    let uploaded = false;
    for (const target of document.querySelectorAll<HTMLElement>(OVERLAYS)) {
      if (!visible(target)) continue;
      // A surface belongs to the same visible map, never another retained route.
      if (topDialog ? !topDialog.contains(target) : !target.closest(".cp-map"))
        continue;
      let surface = surfaces.get(target);
      if (!surface) {
        const layer = document.createElement("span");
        layer.className = "cp-liquid-layer";
        layer.setAttribute("aria-hidden", "true");
        const canvas = document.createElement("canvas");
        layer.append(canvas);
        const position = target.style.position;
        const positioned = getComputedStyle(target).position === "static";
        if (positioned) target.style.position = "relative";
        // A sheet's first child is its scroll viewport. Keep that DOM contract
        // intact for scrolling and touch consumers; the layer is out of flow.
        if (target.matches("[data-map-sheet]")) target.append(layer);
        else target.prepend(layer);
        surface = { layer, canvas, position, positioned };
        resize.observe(target);
        surfaces.set(target, surface);
      }
      try {
        if (!renderer.draw(snapshot, target, !uploaded)) {
          unavailable = true;
          fallback();
          break;
        }
        uploaded = true;
        const context = surface.canvas.getContext("2d");
        if (!context) continue;
        surface.canvas.width = renderer.canvas.width;
        surface.canvas.height = renderer.canvas.height;
        context.drawImage(renderer.canvas, 0, 0);
        target.dataset.liquidSurface = "ready";
      } catch {
        unavailable = true;
        fallback();
        break;
      }
    }
  };
  const schedule = () => {
    if (!disposed && !timer && !unavailable) timer = setTimeout(refresh, 180);
  };
  // Ignore our own layers and attributes: DOM discovery must not form a render loop.
  const observer = new MutationObserver((records) => {
    if (
      records.some((record) => {
        const target = record.target as HTMLElement;
        if (target.closest?.(".cp-liquid-layer")) return false;
        const tracked = surfaces.get(target);
        if (
          record.type === "childList" &&
          tracked &&
          tracked.layer.parentElement !== target
        )
          return true;
        if (record.type === "childList")
          return [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              !(
                node instanceof HTMLElement &&
                node.classList.contains("cp-liquid-layer")
              ),
          );
        return true;
      })
    )
      schedule();
  });
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "open", "data-snap"],
    childList: true,
    subtree: true,
    characterData: true,
  });
  const resize = new ResizeObserver(schedule);
  const frame = document.querySelector(".cp-mobile-frame");
  if (frame) resize.observe(frame);
  preference.addEventListener("change", schedule);
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("scroll", schedule, {
    passive: true,
    capture: true,
  });
  document.addEventListener("load", schedule, true);
  document.addEventListener("visibilitychange", schedule);
  const lost = (event: Event) => {
    event.preventDefault();
    unavailable = true;
    fallback();
  };
  renderer.canvas.addEventListener("webglcontextlost", lost);
  schedule();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    observer.disconnect();
    resize.disconnect();
    preference.removeEventListener("change", schedule);
    window.removeEventListener("resize", schedule);
    document.removeEventListener("scroll", schedule, true);
    document.removeEventListener("load", schedule, true);
    document.removeEventListener("visibilitychange", schedule);
    renderer.canvas.removeEventListener("webglcontextlost", lost);
    fallback();
    Container.instances = Container.instances.filter(
      (item) => item !== renderer,
    );
    renderer.gl?.getExtension("WEBGL_lose_context")?.loseContext();
  };
}
