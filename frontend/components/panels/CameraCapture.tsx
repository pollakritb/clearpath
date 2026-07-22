"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/frontend/lib/api-client";
import { T } from "@/frontend/lib/ui";

export interface CameraEvidence {
  file: File;
  burstFiles: File[];
  sessionToken: string;
  capturedAt: string;
}

export default function CameraCapture({
  onCaptured,
  onCleared,
}: {
  onCaptured: (evidence: CameraEvidence) => void;
  onCleared: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<{ token: string; issuedAt: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function startCamera() {
    setLoading(true);
    setError(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
      onCleared();
    }
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("อุปกรณ์หรือ browser นี้ไม่รองรับกล้องภายในเว็บ");
      }
      const session = await api.captureSession();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      sessionRef.current = {
        token: session.token,
        issuedAt: session.issued_at,
      };
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOpen(true);
    } catch (cause) {
      stopStream();
      if (cause instanceof ApiError) setError(cause.message);
      else if (
        cause instanceof DOMException &&
        cause.name === "NotAllowedError"
      ) {
        setError("กรุณาอนุญาตการใช้กล้อง แล้วกดเปิดกล้องอีกครั้ง");
      } else {
        setError(cause instanceof Error ? cause.message : "เปิดกล้องไม่สำเร็จ");
      }
    } finally {
      setLoading(false);
    }
  }

  function captureFrame(video: HTMLVideoElement, index: number): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("ไม่สามารถสร้างภาพจากกล้องได้"));
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("บันทึกภาพไม่สำเร็จ กรุณาลองใหม่"));
            return;
          }
          resolve(
            new File([blob], `pm25-${Date.now()}-${index}.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now(),
            }),
          );
        },
        "image/jpeg",
        0.9,
      );
    });
  }

  async function takePhoto() {
    const video = videoRef.current;
    const session = sessionRef.current;
    if (!video || !session || !video.videoWidth || !video.videoHeight) {
      setError("กล้องยังไม่พร้อม กรุณารอสักครู่แล้วลองใหม่");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const files: File[] = [];
      for (let index = 0; index < 3; index += 1) {
        if (index > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        files.push(await captureFrame(video, index));
      }
      const url = URL.createObjectURL(files[0]);
      setPreview(url);
      stopStream();
      onCaptured({
        file: files[0],
        burstFiles: files.slice(1),
        sessionToken: session.token,
        capturedAt: new Date().toISOString(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ถ่ายภาพไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  const buttonStyle: React.CSSProperties = {
    minHeight: "44px",
    border: "none",
    borderRadius: "10px",
    padding: ".65em .9em",
    fontFamily: "inherit",
    fontWeight: 800,
    cursor: "pointer",
  };

  return (
    <div>
      <div
        style={{
          minHeight: "190px",
          overflow: "hidden",
          borderRadius: "12px",
          background: "#111",
          display: "grid",
          placeItems: "center",
          position: "relative",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="ภาพจากกล้องสำหรับถ่ายหน้าจอเครื่องวัด"
          style={{
            width: "100%",
            maxHeight: "280px",
            display: cameraOpen ? "block" : "none",
          }}
        />
        {preview && (
          <Image
            unoptimized
            src={preview}
            alt="ภาพหน้าจอเครื่องวัดที่เพิ่งถ่าย"
            width={960}
            height={720}
            style={{
              width: "100%",
              height: "auto",
              maxHeight: "280px",
              objectFit: "contain",
            }}
          />
        )}
        {!cameraOpen && !preview && (
          <div
            style={{
              color: "#d7dddc",
              textAlign: "center",
              padding: "2em 1em",
              fontSize: ".75em",
            }}
          >
            <div aria-hidden style={{ fontSize: "2.2em" }}>
              ▣
            </div>
            ไม่มีปุ่มเลือกไฟล์จากแกลเลอรี
          </div>
        )}
      </div>
      <div className="cp-camera-actions">
        {!cameraOpen && (
          <button
            type="button"
            onClick={startCamera}
            disabled={loading}
            className="cp-focus"
            style={{
              ...buttonStyle,
              flex: 1,
              background: T.teal,
              color: "#fff",
            }}
          >
            {loading
              ? "กำลังเปิดกล้อง…"
              : preview
                ? "ถ่ายใหม่"
                : "เปิดกล้องในแอป"}
          </button>
        )}
        {cameraOpen && (
          <>
            <button
              type="button"
              onClick={takePhoto}
              className="cp-focus"
              style={{
                ...buttonStyle,
                flex: 1,
                background: T.brandGrad,
                color: "#fff",
              }}
            >
              {loading ? "กำลังเก็บ 3 เฟรม…" : "ถ่ายหน้าจอเครื่องวัด"}
            </button>
            <button
              type="button"
              onClick={stopStream}
              className="cp-focus"
              style={{ ...buttonStyle, background: T.chip, color: T.ink }}
            >
              ยกเลิก
            </button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" style={{ fontSize: ".72em", color: "#c2433a" }}>
          {error}
        </p>
      )}
    </div>
  );
}
