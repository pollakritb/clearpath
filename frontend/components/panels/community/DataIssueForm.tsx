"use client";

import { useState } from "react";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import { api, apiErrorMessage } from "@/frontend/lib/api-client";
import type { DataIssueCategory, DataIssueCreate } from "@/frontend/types";

const EMPTY: DataIssueCreate = {
  category: "station",
  reference_id: "",
  message: "",
};

export default function DataIssueForm() {
  const auth = useAuth();
  const [form, setForm] = useState<DataIssueCreate>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!auth.user && !auth.localDemo) {
    return (
      <div className="cp-data-issue-form">
        <p>เข้าสู่ระบบเพื่อให้ผู้ดูแลติดตามรายการและป้องกันสแปม</p>
        <AuthControl />
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.reportDataIssue({
        ...form,
        reference_id: form.reference_id?.trim() || null,
        message: form.message.trim(),
      });
      setMessage(result.message);
      setForm(EMPTY);
    } catch (cause) {
      setError(apiErrorMessage(cause, "ส่งรายการไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="cp-data-issue-form" onSubmit={submit}>
      <p>
        ระบุชื่อสถานี อำเภอ หรือตำบลได้ แต่ไม่ต้องส่งพิกัดละเอียด อีเมล ลิงก์
        หรือภาพส่วนตัว
      </p>
      <label>
        ข้อมูลส่วนไหนผิด
        <select
          className="cp-focus"
          value={form.category}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              category: event.target.value as DataIssueCategory,
            }))
          }
        >
          <option value="station">ค่าสถานีตรวจวัด</option>
          <option value="forecast">ค่าพยากรณ์</option>
          <option value="map">ตำแหน่งหรือข้อมูลบนแผนที่</option>
          <option value="community">ข้อมูลชุมชน</option>
          <option value="other">เรื่องอื่น</option>
        </select>
      </label>
      <label>
        รหัสอ้างอิง (ถ้ามี)
        <input
          className="cp-focus"
          value={form.reference_id ?? ""}
          maxLength={100}
          placeholder="เช่น 81t หรือเวลาพยากรณ์"
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              reference_id: event.target.value,
            }))
          }
        />
      </label>
      <label>
        รายละเอียด
        <textarea
          className="cp-focus"
          value={form.message}
          minLength={10}
          maxLength={1000}
          required
          rows={4}
          placeholder="บอกสิ่งที่เห็นและข้อมูลที่คาดว่าควรเป็น โดยใช้ชื่อพื้นที่สาธารณะ"
          onChange={(event) =>
            setForm((current) => ({ ...current, message: event.target.value }))
          }
        />
      </label>
      <small>{form.message.length}/1000 ตัวอักษร</small>
      {error && (
        <div role="alert" className="cp-data-issue-form__error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="cp-data-issue-form__success">
          {message}
        </div>
      )}
      <button type="submit" className="cp-focus" disabled={saving}>
        {saving ? "กำลังส่ง…" : "ส่งให้ผู้ดูแลตรวจ"}
      </button>
    </form>
  );
}
