import { test as base } from "@playwright/test";

export * from "@playwright/test";

/** Emit fresh synthetic fixes for explicitly configured GPS. Browser permission
 * checks remain active; no location is supplied unless the
 * test explicitly sets one through context.setGeolocation().
 */
export const test = base.extend({
  context: async ({ context }, run) => {
    const setGeolocation = context.setGeolocation.bind(context);
    let coordinates: Parameters<typeof setGeolocation>[0] = null;
    context.setGeolocation = async (value) => {
      coordinates = value;
      await setGeolocation(value);
    };
    await context.exposeBinding("__clearpathTestPosition", () => coordinates);
    await context.addInitScript(() => {
      const source = window as unknown as {
        __clearpathTestPosition: () => Promise<{
          latitude: number;
          longitude: number;
          accuracy?: number;
        } | null>;
      };
      const native = navigator.geolocation.getCurrentPosition.bind(
        navigator.geolocation,
      );
      navigator.geolocation.getCurrentPosition = (success, error, options) => {
        void source
          .__clearpathTestPosition()
          .then(async (point) => {
            const permission = await navigator.permissions.query({
              name: "geolocation",
            });
            if (!point || permission.state !== "granted") {
              native(success, error, options);
              return;
            }
            success({
              coords: {
                latitude: point.latitude,
                longitude: point.longitude,
                accuracy: point.accuracy ?? 0,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
              },
              timestamp: Date.now(),
            } as GeolocationPosition);
          })
          .catch(() => native(success, error, options));
      };
      const nativeWatch = navigator.geolocation.watchPosition.bind(
        navigator.geolocation,
      );
      const nativeClear = navigator.geolocation.clearWatch.bind(
        navigator.geolocation,
      );
      let nextId = -1;
      const watches = new Map<
        number,
        { active: boolean; timer?: number; native?: number }
      >();
      navigator.geolocation.watchPosition = (success, error, options) => {
        const id = nextId--;
        const watch: { active: boolean; timer?: number; native?: number } = {
          active: true,
        };
        watches.set(id, watch);
        void source.__clearpathTestPosition().then((point) => {
          if (!watch.active) return;
          if (!point) {
            watch.native = nativeWatch(success, error, options);
            return;
          }
          const sample = () =>
            navigator.geolocation.getCurrentPosition(
              (position) => {
                if (watch.active) success(position);
              },
              (issue) => {
                if (watch.active) error?.(issue);
              },
              options,
            );
          sample();
          watch.timer = window.setInterval(sample, 1000);
        });
        return id;
      };
      navigator.geolocation.clearWatch = (id) => {
        const watch = watches.get(id);
        if (!watch) {
          nativeClear(id);
          return;
        }
        watch.active = false;
        if (watch.timer !== undefined) clearInterval(watch.timer);
        if (watch.native !== undefined) nativeClear(watch.native);
        watches.delete(id);
      };
    });
    try {
      await run(context);
    } finally {
      context.setGeolocation = setGeolocation;
    }
  },
});
