"""Generate schema-only exam documentation from a verified numeric catalog.

The input contains schema metadata, never business rows. This writes docs only.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from backend.core.identifiers import PREFIXES

PURPOSE = {
    "activities": "กิจกรรมหรือเนื้อหาประกอบชุมชน",
    "alert_events": "ประวัติการสร้างเหตุการณ์แจ้งเตือนเพื่อป้องกันการส่งซ้ำ",
    "announcements": "ประกาศของระบบ",
    "audit_logs": "บันทึกตรวจสอบการทำงานย้อนหลัง",
    "cams_grid_active": "ตัวชี้ generation ของพื้นผิว CAMS ที่กำลังให้บริการ",
    "cams_grid_chunks": "ข้อมูลชั่วคราวระหว่างเก็บกริดทีละ batch",
    "cams_grid_definitions": "นิยามแกนพิกัดกริดจากแหล่งข้อมูลภายนอก",
    "cams_grid_frames": "ค่าพยากรณ์ของกริดในแต่ละเวลา",
    "cams_grid_generations": "รอบข้อมูลกริดที่เผยแพร่พร้อมกันเป็นชุด",
    "cams_grid_jobs": "งานรวบรวมกริดและสถานะ lease/retry",
    "capture_sessions": "หลักฐาน session กล้องที่มีอายุสั้นและใช้ได้ครั้งเดียว",
    "community_help_claims": "การเริ่มช่วยวัดตามคำขอก่อนถ่ายภาพ",
    "community_reports": "รายงาน PM2.5 พร้อมผลตัดสิน OCR และ Trust",
    "community_xp_accounts": "บัญชี XP และตัวตนสมาชิกสาธารณะแยกจากบัญชีเข้าสู่ระบบ",
    "community_xp_control": "สวิตช์และ maintenance ของ XP; ไม่ใช่รหัสรายการ",
    "community_xp_events": "สมุดรายการ XP แบบเก็บประวัติและ reversal",
    "community_xp_jobs": "คิวคำนวณ XP จากผลตัดสินรายงาน",
    "data_issue_reports": "ปัญหาคุณภาพข้อมูลที่ผู้ใช้แจ้ง",
    "fire_feature_snapshots": "snapshot satellite hotspot ประกอบการวิเคราะห์สถานี",
    "forecast_data_quality_daily": "สรุปคุณภาพข้อมูลรายวันแยกแหล่งและสถานี",
    "forecast_provider_snapshots": "หลักฐานพยากรณ์ดิบจาก CAMS แยกสถานีและเวลา",
    "forecast_provider_sync_runs": "ประวัติการรับข้อมูลพยากรณ์จาก provider",
    "line_notification_links": "การผูกบัญชีกับ LINE และสถานะ consent/การเชื่อมต่อ",
    "line_webhook_events": "รหัสเหตุการณ์ภายนอกสำหรับป้องกัน webhook ซ้ำ",
    "measurement_delivery_leases": "lease การส่งแจ้งเตือนคำขอวัด ป้องกัน worker ส่งชนกัน",
    "measurement_helper_presence": "สถานะอาสาช่วยวัดและ GPS ล่าสุดแบบ private",
    "measurement_request_recipients": "รายชื่อผู้ได้รับคำเชิญและสถานะปฏิเสธคำขอ",
    "measurement_requests": "คำขอวัดตามสถานที่ ช่วงเวลา และรัศมี",
    "notification_outbox": "คิวส่งข้อความพร้อม retry และ deduplication",
    "notification_preferences": "การตั้งค่าและ consent การแจ้งเตือน",
    "pm25_readings": "ประวัติค่าฝุ่นจากสถานีทางการ",
    "profiles": "บัญชีภายใน สิทธิ์ และคะแนนความน่าเชื่อถือ",
    "public_map_events": "เหตุการณ์สำหรับอัปเดตข้อมูลบนแผนที่",
    "rate_limit_windows": "จำนวนการเรียก action ในแต่ละช่วงเวลา",
    "report_comments": "ความคิดเห็นต่อรายงาน",
    "report_drafts": "ภาพและ OCR ระหว่างเตรียมส่งรายงาน",
    "report_evidence": "หลักฐาน private แบบหนึ่งต่อหนึ่งกับรายงาน",
    "report_reactions": "ปฏิกิริยาต่อรายงาน หนึ่งรายการต่อผู้ใช้",
    "report_reviews": "คำขอบคุณและดาวพร้อมหลักฐานระยะ GPS",
    "reputation_events": "ประวัติการเปลี่ยนคะแนน Trust/Reputation",
    "stations": "สถานีทางการ ใช้รหัสที่ provider กำหนด",
    "sync_runs": "ประวัติการ sync Air4Thai",
    "user_notifications": "กล่องแจ้งเตือนภายในระบบ",
    "weather_observations": "ประวัติอากาศที่ผูกสถานีและเวลา",
}


def generate(
    catalog: dict,
    output: Path,
    *,
    production_verified: bool = False,
    verified_project_ref: str | None = None,
):
    if verified_project_ref and not re.fullmatch(r"[a-z]{20}", verified_project_ref):
        raise ValueError("invalid verified project reference")
    tables = {}
    for c in catalog["columns"]:
        tables.setdefault(c["table_name"], []).append(c)
    if (
        len(tables) != 44
        or next(c for c in tables["profiles"] if c["column_name"] == "id")["udt_name"]
        != "int8"
    ):
        raise ValueError("a verified 44-table numeric catalog is required")
    constraints = catalog["constraints"]
    clean = not any(c["column_name"].startswith("legacy_") for c in catalog["columns"])
    primary = {
        c["table"]: c["definition"].removeprefix("PRIMARY KEY ")
        for c in constraints
        if c["type"] == "p"
    }
    lines = [
        "# ClearPath — Data dictionary",
        "",
        f"Schema รุ่น {3 if clean else 2}: PK/FK ของข้อมูลภายในใช้ BIGINT; API ส่ง code เป็น string เช่น `RPT-000001`. "
        + (
            f"สร้างจาก catalog โปรเจกต์ `{verified_project_ref}` ที่ตรวจสอบแล้ว 44 ตาราง. ดู [การย้ายไปโปรเจกต์ใหม่](../runbooks/fresh-project-2026-11-01.md)."
            if verified_project_ref
            else "สร้างจาก production catalog ที่ตรวจสอบแล้ว 44 ตาราง."
            if production_verified
            else "นี่คือ schema เป้าหมายจาก migration ที่ทดสอบแล้ว 44 ตาราง; **ยังไม่ยืนยัน production cutover**. ดู [สถานะ recovery](../runbooks/identifier-cutover-recovery-2026-11-01.md)."
        ),
        "",
        (
            "ตาราง public ไม่มี `legacy_id` หรือ `legacy_*` แล้ว. UUID ที่เหลือใช้กับ Supabase Auth และ token/lease/idempotency ตามหน้าที่. "
            if clean
            else "UUID ที่เหลือใช้กับ Supabase Auth, token/lease/idempotency หรือคอลัมน์ `legacy_*` เพื่อรองรับข้อมูลและลิงก์เดิม. "
        )
        + "ไม่มี UUID เป็น PK ของตาราง public. Sequence ข้ามเลขได้และไม่เริ่มใหม่ทุกปี; code มีอย่างน้อย 6 หลักและไม่ตัดเลขที่ยาวกว่า 6 หลัก.",
        "",
        "## ภาพรวมตาราง",
        "",
        "| ตาราง | หน้าที่ | Primary key | Code |",
        "|---|---|---|---|",
    ]
    for table in sorted(tables):
        prefix = PREFIXES.get(table)
        readable = (
            prefix + "-000001"
            if prefix
            else "MBR-000001 (member_id แยกจาก USR)"
            if table == "community_xp_accounts"
            else "คีย์สัมพันธ์ / natural key / singleton"
        )
        lines.append(
            f"| `{table}` | {PURPOSE[table]} | `{primary[table]}` | {readable} |"
        )
    lines += [
        "",
        "## กติกาคีย์และสิทธิ์",
        "",
        "- `id` ของ entity ใช้ BIGINT; `code` เป็น generated column และมี UNIQUE constraint. ตารางเดิมที่ใช้ BIGSERIAL คงเลขเดิม.",
        "- FK เช่น `report_id`, `user_id`, `request_id` ใช้ตัวเลขจริงในการ join. ตารางหนึ่งต่อหนึ่งและตารางเชื่อมใช้ PK/FK ร่วมกันตาม ERD.",
        "- `profiles.auth_user_id` เป็น UUID UNIQUE NOT NULL ที่อ้างถึง `auth.users`. รหัส USR เป็นข้อมูลภายในและใช้แยกจากตัวตน MBR.",
        (
            "- ตารางหลักเก็บเฉพาะ numeric keys และ code. Mapping สำหรับ audit/privacy/retry อยู่ใน `private.identifier_aliases` เท่านั้น แยก namespace และไม่เปิดให้ browser."
            if clean
            else "- `legacy_*` คงค่าเดิมไว้สำหรับ audit, privacy seed, retry และ URL เก่า. ไม่ใช่ PK/FK ของ feature ปัจจุบัน. `private.identifier_aliases` แยก namespace ของแต่ละ entity และไม่เปิดให้ browser."
        ),
        "- Historical references ใน XP/map events อาจไม่มี FK เพื่อเก็บประวัติหลังลบปลายทาง; ห้ามสร้างรายการใหม่เพียงเพื่อทำให้ reference ดูครบ.",
        "- รหัสที่เดาได้ไม่ใช่สิทธิ์: API ยังตรวจผู้ส่ง/เจ้าของ/ผู้รับคำเชิญ และ RLS เชื่อมกับ auth_user_id.",
        "- รหัสสถานี, grid definition, LINE webhook event และ security tokens คงรูปแบบจากแหล่งเดิม.",
        "- `review` มี 44 security_invoker views สำหรับตรวจข้อมูลด้วย postgres/service_role ฝั่ง server; ไม่มีพิกัดจริง รูป private หรือ mapping MBR → USR ใน view บัญชีสมาชิก.",
        "",
        "## คอลัมน์รายตาราง",
        "",
    ]
    types = {
        "int8": "bigint",
        "int4": "integer",
        "int2": "smallint",
        "float8": "double precision",
        "bool": "boolean",
    }
    for table, cols in sorted(tables.items()):
        lines += [
            "### " + table,
            "",
            PURPOSE[table] + ".",
            "",
            "| คอลัมน์ | Type | Null | Default / generation |",
            "|---|---|---|---|",
        ]
        for c in cols:
            t = c["udt_name"]
            t = (
                (types.get(t[1:], t[1:]) + "[]")
                if t.startswith("_")
                else types.get(t, t)
            )
            default = (
                "IDENTITY (GENERATED ALWAYS)"
                if c.get("is_identity") == "YES"
                else c.get("generation_expression")
                if c.get("is_generated") == "ALWAYS"
                else c.get("column_default")
            )
            if not default:
                default = "—"
            if c["column_name"].startswith("legacy_"):
                default += "; compatibility metadata"
            default = default.replace("|", "&#124;").replace("\n", " ")
            lines.append(
                f"| `{c['column_name']}` | `{t}` | {c['is_nullable']} | `{default}` |"
            )
        lines.append("")
    output.mkdir(parents=True, exist_ok=True)
    (output / "data-dictionary.md").write_text("\n".join(lines))
    graph = ["erDiagram", "    auth_users {", "        uuid id PK", "    }"]
    for table, cols in sorted(tables.items()):
        pk = set(primary[table].strip("()").split(", "))
        fk = set()
        for c in constraints:
            if c["table"] == table and c["type"] == "f":
                fk.update(
                    re.search(r"FOREIGN KEY \((.*?)\)", c["definition"])[1].split(", ")
                )
        graph.append(f"    {table} {{")
        for c in cols:
            col = c["column_name"]
            if col in pk or col in fk or col in {"code", "member_id", "member_code"}:
                tag = " PK" if col in pk else " FK" if col in fk else ""
                graph.append(
                    f"        {types.get(c['udt_name'], c['udt_name']).replace(' ', '_')} {col}{tag}"
                )
        graph.append("    }")
    for c in constraints:
        if c["type"] != "f":
            continue
        m = re.search(
            r"FOREIGN KEY \((\w+)\) REFERENCES (?:(\w+)\.)?(\w+)\((\w+)\)",
            c["definition"],
        )
        if not m:
            raise ValueError("unsupported FK")
        col, schema, parent, _ = m.groups()
        parent = "auth_users" if schema == "auth" else parent
        graph.append(f'    {parent} ||--o{{ {c["table"]} : "{col}"')
    graph.insert(
        1,
        f"    %% Verified numeric schema for {verified_project_ref}"
        if verified_project_ref
        else "    %% Numeric target schema; production verification required"
        if not production_verified
        else "    %% Verified numeric production schema",
    )
    (output / "erd.mmd").write_text("\n".join(graph) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", type=Path)
    parser.add_argument("--verified-production", action="store_true")
    parser.add_argument("--verified-project-ref")
    parser.add_argument("--output", type=Path, default=Path("docs/database"))
    args = parser.parse_args()
    generate(
        json.loads(args.catalog.read_text()),
        args.output,
        production_verified=args.verified_production,
        verified_project_ref=args.verified_project_ref,
    )


if __name__ == "__main__":
    main()
