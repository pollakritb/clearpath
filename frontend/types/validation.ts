export interface LoocvMetrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  me: number | null;
  r2: number | null;
  skill: number | null;
}

export interface ValidationResponse {
  idw: LoocvMetrics | null;
  kriging: LoocvMetrics | null;
  mean: LoocvMetrics | null;
  nearest: LoocvMetrics | null;
  station_count: number;
  better: string | null;
}
