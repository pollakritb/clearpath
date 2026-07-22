import { T } from "@/frontend/lib/ui";
import type { ReportDetails } from "@/frontend/types/ui";

import { FORM_CONTROL_STYLE } from "../styles";

interface DeviceFieldsProps {
  details: ReportDetails;
  onChange: (values: Partial<ReportDetails>) => void;
}

const CHECKBOX_STYLE = { marginTop: ".22em", width: "18px", height: "18px" };

export default function DeviceFields({ details, onChange }: DeviceFieldsProps) {
  return (
    <>
      <label style={{ fontSize: ".76em", fontWeight: 600 }}>
        ชื่อที่แสดงในชุมชน
        <input
          value={details.displayName}
          onChange={(event) => onChange({ displayName: event.target.value })}
          maxLength={80}
          placeholder="ไม่บังคับ"
          style={{ ...FORM_CONTROL_STYLE, marginTop: ".3em" }}
        />
      </label>
      <div className="cp-form-grid">
        <label style={{ fontSize: ".74em", fontWeight: 600 }}>
          ค่าบนเครื่องเป็น
          <select
            value={details.averagingPeriod}
            onChange={(event) =>
              onChange({
                averagingPeriod: event.target
                  .value as ReportDetails["averagingPeriod"],
              })
            }
            style={{ ...FORM_CONTROL_STYLE, marginTop: ".3em" }}
          >
            <option value="instant">ค่าขณะนั้น</option>
            <option value="1_minute">เฉลี่ย 1 นาที</option>
            <option value="5_minutes">เฉลี่ย 5 นาที</option>
          </select>
        </label>
        <label style={{ fontSize: ".74em", fontWeight: 600 }}>
          รอค่าคงที่ (วินาที)
          <input
            type="number"
            min={0}
            max={600}
            value={details.measurementDurationSeconds}
            onChange={(event) =>
              onChange({
                measurementDurationSeconds: Number(event.target.value),
              })
            }
            style={{ ...FORM_CONTROL_STYLE, marginTop: ".3em" }}
          />
        </label>
      </div>
      <label style={{ fontSize: ".76em", fontWeight: 600 }}>
        ยี่ห้อหรือรุ่นเครื่องวัด <span style={{ color: T.red }}>*</span>
        <input
          required
          value={details.deviceModel}
          onChange={(event) => onChange({ deviceModel: event.target.value })}
          maxLength={80}
          placeholder="เช่น Xiaomi Smart Air Monitor"
          style={{ ...FORM_CONTROL_STYLE, marginTop: ".3em" }}
        />
      </label>
      <label
        style={{
          display: "flex",
          gap: ".55em",
          alignItems: "flex-start",
          fontSize: ".74em",
        }}
      >
        <input
          type="checkbox"
          checked={details.deviceCalibrated}
          onChange={(event) =>
            onChange({ deviceCalibrated: event.target.checked })
          }
          style={CHECKBOX_STYLE}
        />
        <span>เครื่องนี้มีการสอบเทียบหรือเทียบกับเครื่องมาตรฐาน</span>
      </label>
      {details.deviceCalibrated && (
        <label style={{ fontSize: ".74em", fontWeight: 600 }}>
          วันที่สอบเทียบล่าสุด
          <input
            type="date"
            required
            value={details.calibratedAt}
            onChange={(event) => onChange({ calibratedAt: event.target.value })}
            style={{ ...FORM_CONTROL_STYLE, marginTop: ".3em" }}
          />
        </label>
      )}
      <label
        style={{
          display: "flex",
          gap: ".55em",
          alignItems: "flex-start",
          fontSize: ".74em",
          lineHeight: 1.45,
        }}
      >
        <input
          type="checkbox"
          checked={details.measurementStable}
          onChange={(event) =>
            onChange({ measurementStable: event.target.checked })
          }
          style={CHECKBOX_STYLE}
        />
        <span>
          ยืนยันว่ากำลังวัดกลางแจ้ง รอให้ค่าบนเครื่องคงที่
          และไม่ได้วางติดท่อไอเสียหรือแหล่งควันโดยตรง
        </span>
      </label>
      <label
        style={{
          display: "flex",
          gap: ".55em",
          alignItems: "flex-start",
          fontSize: ".74em",
          lineHeight: 1.45,
        }}
      >
        <input
          type="checkbox"
          checked={details.nearEmissionSource}
          onChange={(event) =>
            onChange({ nearEmissionSource: event.target.checked })
          }
          style={CHECKBOX_STYLE}
        />
        <span>
          จุดวัดอยู่ติดแหล่งควัน การเผา ท่อไอเสีย หรือแหล่งกำเนิดโดยตรง
        </span>
      </label>
      {details.nearEmissionSource && (
        <p style={{ margin: 0, fontSize: ".68em", color: T.red }}>
          รายงานยังแสดงเป็นเหตุการณ์เฉพาะจุดได้ แต่จะไม่ถูกนำไปเปลี่ยนพื้นผิว
          IDW
        </p>
      )}
      <label style={{ fontSize: ".74em", fontWeight: 600 }}>
        หมายเหตุสภาพแวดล้อม
        <textarea
          value={details.measurementNote}
          onChange={(event) =>
            onChange({ measurementNote: event.target.value })
          }
          maxLength={300}
          rows={2}
          placeholder="เช่น ริมถนน รถไม่หนาแน่น ไม่มีการเผาใกล้จุดวัด"
          style={{
            ...FORM_CONTROL_STYLE,
            marginTop: ".3em",
            resize: "vertical",
          }}
        />
      </label>
    </>
  );
}
