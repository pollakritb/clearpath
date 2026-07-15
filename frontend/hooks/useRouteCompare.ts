"use client";

import { useCallback, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import type { RouteCompareRequest, RouteCompareResponse } from "@/frontend/types";

export function useRouteCompare() {
  const [data, setData] = useState<RouteCompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (req: RouteCompareRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.compareRoutes(req);
      setData(res);
      return res;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "เปรียบเทียบเส้นทางไม่สำเร็จ";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, compare, reset };
}
