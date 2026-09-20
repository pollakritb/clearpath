import AppIcon from "@/frontend/components/ui/AppIcon";
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
        ยี่ห้อหรือรุ่นเครื่องวัด <span>(ไม่บังคับ)</span>
        <input
          value={details.deviceModel}
          onChange={(event) => onChange({ deviceModel: event.target.value })}
          maxLength={80}
          placeholder="เช่น Xiaomi Smart Air Monitor"
          style={{ ...FORM_CONTROL_STYLE, marginTop: ".3em" }}
        />
      </label>

      <label className="cp-report-confirmation">
        <input
          type="checkbox"
          checked={details.measurementStable}
          onChange={(event) =>
            onChange({ measurementStable: event.target.checked })
          }
          style={CHECKBOX_STYLE}
        />
        <span>
          <strong>ยืนยันวิธีวัดถูกต้อง</strong>
          <small>
            วัดกลางแจ้ง รอค่าบนเครื่องคงที่ และข้อมูลด้านล่างตรงกับสภาพจริง
          </small>
        </span>
      </label>

      <label className="cp-report-confirmation" data-warning>
        <input
          type="checkbox"
          checked={details.nearEmissionSource}
          onChange={(event) =>
            onChange({ nearEmissionSource: event.target.checked })
          }
          style={CHECKBOX_STYLE}
        />
        <span>
          <strong>จุดนี้อยู่ติดแหล่งควันหรือท่อไอเสีย</strong>
          <small>
            เลือกเมื่อเป็นเหตุการณ์เฉพาะจุด
            ข้อมูลจะไม่ถูกนำไปเปลี่ยนพื้นผิวค่าฝุ่น
          </small>
        </span>
      </label>

      <details className="cp-device-advanced">
        <summary className="cp-focus">
          <span>
            <AppIcon name="settings" size={17} />
            รายละเอียดเพิ่มเติมของเครื่องวัด
          </span>
          <AppIcon name="chevron" size={17} />
        </summary>
        <div className="cp-device-advanced__body">
          <div className="cp-form-grid">
            <label>
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
            <label>
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

          <label>
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
        </div>
      </details>
    </>
  );
}
