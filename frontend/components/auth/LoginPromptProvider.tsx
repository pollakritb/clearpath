"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";

import AuthControl from "./AuthControl";
import { useAuth } from "./AuthProvider";

interface LoginPromptCopy {
  title: string;
  description: string;
}

interface LoginPromptState {
  openLoginPrompt: (copy?: Partial<LoginPromptCopy>) => boolean;
  closeLoginPrompt: () => void;
}

const DEFAULT_COPY: LoginPromptCopy = {
  title: "เข้าสู่ระบบด้วย Google",
  description: "เข้าสู่ระบบเพื่อใช้ฟีเจอร์นี้และบันทึกข้อมูลกับบัญชี ClearPath",
};

const LoginPromptContext = createContext<LoginPromptState | null>(null);

export function LoginPromptProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const [copy, setCopy] = useState<LoginPromptCopy | null>(null);

  const closeLoginPrompt = useCallback(() => setCopy(null), []);
  const openLoginPrompt = useCallback(
    (nextCopy: Partial<LoginPromptCopy> = {}) => {
      if (auth.user || auth.localDemo) return false;
      setCopy({ ...DEFAULT_COPY, ...nextCopy });
      return true;
    },
    [auth.localDemo, auth.user],
  );

  const visibleCopy = auth.user || auth.localDemo ? null : copy;

  useEffect(() => {
    if (!visibleCopy) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLoginPrompt();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeLoginPrompt, visibleCopy]);

  const value = useMemo(
    () => ({ openLoginPrompt, closeLoginPrompt }),
    [closeLoginPrompt, openLoginPrompt],
  );

  return (
    <LoginPromptContext.Provider value={value}>
      {children}
      {visibleCopy && (
        <div
          className="cp-login-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeLoginPrompt();
          }}
        >
          <section
            className="cp-login-modal__card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cp-login-modal-title"
            aria-describedby="cp-login-modal-description"
          >
            <button
              type="button"
              className="cp-login-modal__close cp-focus"
              aria-label="ปิดหน้าต่างเข้าสู่ระบบ"
              onClick={closeLoginPrompt}
              autoFocus
            >
              <AppIcon name="close" size={18} />
            </button>
            <span className="cp-login-modal__icon" aria-hidden="true">
              <AppIcon name="user" size={24} />
            </span>
            <h2 id="cp-login-modal-title">{visibleCopy.title}</h2>
            <p id="cp-login-modal-description">{visibleCopy.description}</p>
            <AuthControl compact />
            <Link href="/settings" onClick={closeLoginPrompt}>
              จัดการบัญชีและความเป็นส่วนตัว
            </Link>
          </section>
        </div>
      )}
    </LoginPromptContext.Provider>
  );
}

export function useLoginPrompt(): LoginPromptState {
  const value = useContext(LoginPromptContext);
  if (!value) {
    throw new Error("useLoginPrompt must be used inside LoginPromptProvider");
  }
  return value;
}
