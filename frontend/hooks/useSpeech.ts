"use client";

import { useCallback, useEffect, useState } from "react";

// Web Speech API (built-in, ไม่ต้อง install) — อ่านสรุปผลออกเสียงภาษาไทย
// รองรับปรับความเร็ว + เลือกเสียง (หญิง/ชาย แบบ best-effort ตามเสียงที่มีในเครื่อง)
// fallback: ถ้าไม่มีเสียงไทย จะใช้เสียง default (ยังพูดได้)

export interface SpeakOptions {
  rate?: number;
  gender?: "f" | "m";
  lang?: string;
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  gender?: "f" | "m",
): SpeechSynthesisVoice | undefined {
  const th = voices.filter((v) => v.lang?.toLowerCase().startsWith("th"));
  const pool = th.length ? th : voices;
  if (!pool.length) return undefined;
  if (!gender) return pool[0];
  const female = pool.find((v) => /female|หญิง|premwadee|kanya|woman/i.test(v.name));
  const male = pool.find((v) => /male|ชาย|niwat|man/i.test(v.name));
  if (gender === "m") return male ?? pool[1] ?? pool[0];
  return female ?? pool[0];
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // อุ่นรายการเสียง (บางเบราว์เซอร์โหลดแบบ async) — ไม่มี setState ใน effect
  useEffect(() => {
    if (supported) window.speechSynthesis.getVoices();
  }, [supported]);

  const speak = useCallback(
    (text: string, opts: SpeakOptions = {}) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      synth.cancel(); // หยุดอันก่อนหน้า

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = opts.lang ?? "th-TH";
      utter.rate = opts.rate ?? 1;

      const voice = pickVoice(synth.getVoices(), opts.gender);
      if (voice) utter.voice = voice;

      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      synth.speak(utter);
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, speak, cancel };
}
