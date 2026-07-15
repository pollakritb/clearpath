"use client";

import { useCallback, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import type { ValidationResponse } from "@/frontend/types";

// โหลดผลตรวจความแม่นยำ (LOOCV) แบบ on-demand (คำนวณหนัก จึงไม่โหลดอัตโนมัติ)
export function useValidation() {
  const [data, setData] = useState<ValidationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.validate("both");
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ตรวจความแม่นยำไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, load };
}
