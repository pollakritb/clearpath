import Link from "next/link";

import AuthControl from "@/frontend/components/auth/AuthControl";
import { useAuth } from "@/frontend/components/auth/AuthProvider";
import AppIcon from "@/frontend/components/ui/AppIcon";

export default function AdminAccessGate() {
  const auth = useAuth();
  const canModerate = ["moderator", "admin"].includes(auth.role);

  if (auth.loading) {
    return (
      <main className="cp-admin-gate">
        <div className="cp-admin-gate__card">
          <span className="cp-admin-gate__mark">C</span>
          <h1>กำลังตรวจสอบสิทธิ์</h1>
          <p>โปรดรอสักครู่ ระบบกำลังตรวจสอบ session ของคุณ</p>
        </div>
      </main>
    );
  }

  if (!auth.user && !auth.localDemo) {
    return (
      <main className="cp-admin-gate">
        <div className="cp-admin-gate__card">
          <span className="cp-admin-gate__mark">
            <AppIcon name="admin" size={28} />
          </span>
          <span className="cp-eyebrow">Restricted workspace</span>
          <h1>เข้าสู่ระบบผู้ดูแล</h1>
          <p>ใช้บัญชีที่ได้รับบทบาท Moderator หรือ Admin เพื่อเปิดหลังบ้าน</p>
          <div className="cp-admin-gate__auth">
            <AuthControl />
          </div>
          <Link href="/" className="cp-admin-back-link cp-focus">
            <AppIcon name="back" size={17} /> กลับไปยังพื้นที่ผู้ใช้งาน
          </Link>
        </div>
      </main>
    );
  }

  if (!canModerate) {
    return (
      <main className="cp-admin-gate">
        <div className="cp-admin-gate__card">
          <span className="cp-admin-gate__mark cp-admin-gate__mark--warning">
            <AppIcon name="alert" size={28} />
          </span>
          <h1>บัญชีนี้ไม่มีสิทธิ์เข้าถึง</h1>
          <p>
            คุณเข้าสู่ระบบแล้ว แต่บทบาทปัจจุบันคือ User กรุณาติดต่อ Admin
            หากต้องรับผิดชอบการตรวจข้อมูล
          </p>
          <div className="cp-admin-gate__actions">
            <Link href="/" className="cp-admin-back-link cp-focus">
              กลับพื้นที่ผู้ใช้
            </Link>
            <AuthControl compact />
          </div>
        </div>
      </main>
    );
  }

  return null;
}
