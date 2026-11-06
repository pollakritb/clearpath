export interface PrivacyRequest {
  id: string;
  status: "pending" | "processing" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
}
export interface AccountPrivacyStatus {
  enabled: boolean;
  requests: PrivacyRequest[];
  export_sections: string[];
  automatic_deletion: boolean;
}
export interface AccountExportPage {
  section: string;
  items: Record<string, unknown>[];
  next_offset: number | null;
  generated_at: string;
  scope: string;
}
export interface DeletionRequest {
  confirmation: "ลบบัญชี";
  acknowledges_retention: true;
}
