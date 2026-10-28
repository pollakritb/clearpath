"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import AppIcon from "@/frontend/components/ui/AppIcon";
import { api, ApiError } from "@/frontend/lib/api-client";
import {
  cameraErrorMessage,
  fitCaptureDimensions,
} from "@/frontend/lib/camera";
import type { PhotoMetadata } from "@/frontend/types";
import { T } from "@/frontend/lib/ui";

const PhotoLocationPicker = dynamic(
  () => import("@/frontend/components/map/PhotoLocationPicker"),
  { ssr: false },
);

export interface CameraEvidence {
  file: File;
  burstFiles: File[];
  sessionToken: string;
  capturedAt: string;
  source?: "camera" | "gallery";
  selectedAt?: string;
  measuredLocation?: { lat: number; lon: number };
  timezoneOffsetMinutes?: number;
  fileLastModifiedAt?: string;
}

type CameraFacing = "environment" | "user";

export default function CameraCapture({
  onCaptured,
  onCleared,
  onLoginRequired,
}: {
  onCaptured: (evidence: CameraEvidence) => void;
  onCleared: () => void;
  onLoginRequired?: () => boolean;
}) {
  const [measuredLocation, setMeasuredLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState<{
    file: File;
    metadata: PhotoMetadata;
    selectedAt: string;
  } | null>(null);
  const [measurementTime, setMeasurementTime] = useState("");
  const [galleryConfirmed, setGalleryConfirmed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<{ token: string; issuedAt: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("environment");
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function stopStream() {
    releaseStream();
    setCameraOpen(false);
    setCameraReady(false);
  }

  async function requestCamera(facing: CameraFacing, exact = false) {
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: exact ? { exact: facing } : { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  }

  async function attachStream(stream: MediaStream, facing: CameraFacing) {
    streamRef.current = stream;
    setCameraFacing(facing);
    setCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    setCameraOpen(true);

    const videoTrack = stream.getVideoTracks()[0];
    const capabilities = videoTrack?.getCapabilities?.();
    const facingModes = capabilities?.facingMode ?? [];
    const devices = await navigator.mediaDevices
      .enumerateDevices?.()
      .catch(() => []);
    const videoDeviceCount =
      devices?.filter((device) => device.kind === "videoinput").length ?? 0;
    setCanSwitchCamera(videoDeviceCount > 1 || facingModes.length > 1);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function startCamera() {
    if (onLoginRequired?.()) return;
    setGallery(null);
    setGalleryConfirmed(false);
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
      const stream = await requestCamera(cameraFacing);
      sessionRef.current = {
        token: session.token,
        issuedAt: session.issued_at,
      };
      await attachStream(stream, cameraFacing);
    } catch (cause) {
      stopStream();
      if (cause instanceof ApiError) setError(cause.message);
      else if (cause instanceof DOMException)
        setError(cameraErrorMessage(cause.name));
      else
        setError(
          cause instanceof Error ? cause.message : cameraErrorMessage(""),
        );
    } finally {
      setLoading(false);
    }
  }

  async function switchCamera() {
    if (!cameraOpen || loading) return;
    const previousFacing = cameraFacing;
    const nextFacing: CameraFacing =
      previousFacing === "environment" ? "user" : "environment";
    setLoading(true);
    setError(null);
    setCameraReady(false);
    releaseStream();
    try {
      let stream: MediaStream;
      try {
        stream = await requestCamera(nextFacing, true);
      } catch (cause) {
        if (
          !(cause instanceof DOMException) ||
          cause.name !== "OverconstrainedError"
        ) {
          throw cause;
        }
        stream = await requestCamera(nextFacing);
      }
      await attachStream(stream, nextFacing);
    } catch (cause) {
      try {
        const restored = await requestCamera(previousFacing);
        await attachStream(restored, previousFacing);
      } catch {
        stopStream();
      }
      if (cause instanceof DOMException)
        setError(cameraErrorMessage(cause.name));
      else
        setError(
          cause instanceof Error ? cause.message : cameraErrorMessage(""),
        );
    } finally {
      setLoading(false);
    }
  }

  function captureFrame(video: HTMLVideoElement, index: number): Promise<File> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const dimensions = fitCaptureDimensions(
        video.videoWidth,
        video.videoHeight,
      );
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
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
        0.82,
      );
    });
  }

  async function takePhoto() {
    const video = videoRef.current;
    const session = sessionRef.current;
    if (
      !video ||
      !session ||
      !cameraReady ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
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

  async function selectGallery(file: File) {
    if (onLoginRequired?.()) return;
    if (
      !(
        [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
          "image/heic-sequence",
          "image/heif-sequence",
        ].includes(file.type) ||
        ((!file.type || file.type === "application/octet-stream") &&
          /\.(heic|heif|jpg|jpeg|png|webp)$/i.test(file.name))
      ) ||
      file.size > 8 * 1024 * 1024
    ) {
      setError(
        "เลือกภาพ JPEG, PNG, WEBP หรือ HEIC/HEIF จาก iPhone ขนาดไม่เกิน 8 MB",
      );
      return;
    }
    setLoading(true);
    setError(null);
    setGallery(null);
    setGalleryConfirmed(false);
    onCleared();
    stopStream();
    try {
      const selectedAt = new Date().toISOString();
      const metadata = await api.photoMetadata(file);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(metadata.preview_data_url ?? URL.createObjectURL(file));
      setGallery({ file, metadata, selectedAt });
      setMeasuredLocation(metadata.exif_gps);
      if (metadata.exif_captured_at) {
        const date = new Date(metadata.exif_captured_at);
        const local = new Date(
          date.getTime() - date.getTimezoneOffset() * 60000,
        );
        setMeasurementTime(local.toISOString().slice(0, 16));
      } else {
        setMeasurementTime(metadata.exif_local_time?.slice(0, 16) ?? "");
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "อ่านข้อมูลภาพไม่สำเร็จ",
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmGallery() {
    if (!gallery || !measurementTime || !measuredLocation) return;
    const date = new Date(measurementTime);
    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() > Date.now() + 5 * 60000
    ) {
      setError("กรุณาระบุเวลาที่วัดให้ถูกต้องและไม่อยู่ในอนาคต");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await api.captureSession();
      onCaptured({
        file: gallery.file,
        burstFiles: [],
        sessionToken: session.token,
        capturedAt: date.toISOString(),
        source: "gallery",
        measuredLocation,
        timezoneOffsetMinutes: date.getTimezoneOffset(),
        selectedAt: gallery.selectedAt,
        fileLastModifiedAt: new Date(gallery.file.lastModified).toISOString(),
      });
      setGalleryConfirmed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ยืนยันภาพไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function updateMeasuredLocation(position: { lat: number; lon: number }) {
    setMeasuredLocation(position);
    setGalleryConfirmed(false);
    onCleared();
  }

  function useGpsForPhoto() {
    if (!navigator.geolocation) {
      setError("อุปกรณ์นี้ไม่รองรับ GPS");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        updateMeasuredLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        }),
      () => setError("อ่าน GPS ไม่สำเร็จ กรุณาระบุตำแหน่งที่วัดบนแผนที่"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
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
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setCameraReady(true)}
          aria-label="ภาพจากกล้องสำหรับถ่ายหน้าจอเครื่องวัด"
          style={{
            width: "100%",
            maxHeight: "280px",
            display: cameraOpen ? "block" : "none",
          }}
        />
        {cameraOpen && (
          <div className="cp-camera-guide" aria-hidden>
            <span>วางตัวเลข PM2.5 ให้อยู่ในกรอบ</span>
          </div>
        )}
        {preview && (
          <Image
            unoptimized
            src={preview}
            alt="ภาพเครื่องวัดที่เลือกสำหรับรายงาน"
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
            <div
              aria-hidden
              style={{ display: "flex", justifyContent: "center" }}
            >
              <AppIcon name="camera" size={34} />
            </div>
            <strong
              style={{ display: "block", marginTop: ".65em", color: "#fff" }}
            >
              เพิ่มภาพเครื่องวัด PM2.5
            </strong>
            <span style={{ display: "block", marginTop: ".3em" }}>
              ถ่ายภาพใหม่ หรือเลือกจากคลังภาพ
            </span>
          </div>
        )}
      </div>
      <input
        ref={galleryInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/heic-sequence,image/heif-sequence,.heic,.heif"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void selectGallery(file);
        }}
      />
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
        {!cameraOpen && (
          <button
            type="button"
            className="cp-focus"
            disabled={loading}
            style={{
              ...buttonStyle,
              flex: 1,
              background: T.chip,
              color: T.ink,
            }}
            onClick={() => {
              if (!onLoginRequired?.()) galleryInput.current?.click();
            }}
          >
            เลือกจากคลังภาพ
          </button>
        )}
        {cameraOpen && (
          <>
            <button
              type="button"
              onClick={takePhoto}
              disabled={loading || !cameraReady}
              className="cp-focus"
              style={{
                ...buttonStyle,
                flex: 1,
                background: T.brandGrad,
                color: "#fff",
              }}
            >
              {loading
                ? "กำลังเก็บ 3 เฟรม…"
                : cameraReady
                  ? "ถ่ายหน้าจอเครื่องวัด"
                  : "กำลังเตรียมกล้อง…"}
            </button>
            {canSwitchCamera && (
              <button
                type="button"
                onClick={switchCamera}
                disabled={loading}
                className="cp-focus cp-camera-switch"
                aria-label={
                  cameraFacing === "environment"
                    ? "สลับเป็นกล้องหน้า"
                    : "สลับเป็นกล้องหลัง"
                }
                style={{ ...buttonStyle, background: T.chip, color: T.ink }}
              >
                <AppIcon name="refresh" size={18} />
                <span>
                  {cameraFacing === "environment" ? "กล้องหน้า" : "กล้องหลัง"}
                </span>
              </button>
            )}
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
      {gallery && (
        <div className="cp-photo-metadata">
          <label>
            วันและเวลาที่วัด
            <input
              type="datetime-local"
              required
              value={measurementTime}
              onChange={(event) => {
                setMeasurementTime(event.target.value);
                setGalleryConfirmed(false);
                onCleared();
              }}
            />
          </label>
          <p>
            {gallery.metadata.exif_local_time
              ? "พบเวลาถ่ายในภาพ กรุณาตรวจสอบและยืนยัน"
              : "ไม่พบเวลาถ่ายในภาพ กรุณาระบุเวลาที่วัดจริง"}{" "}
            · เขตเวลา {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <div>
            <strong>ตำแหน่งที่วัด</strong>
            <p>
              {gallery.metadata.exif_gps
                ? "พบพิกัดในภาพ กรุณาตรวจและยืนยันตำแหน่ง"
                : "ไม่มีพิกัดในภาพ กรุณาเลือกจุดที่วัดจริง"}
            </p>
            <button
              type="button"
              className="cp-focus cp-photo-gps"
              onClick={useGpsForPhoto}
            >
              ใช้ตำแหน่งปัจจุบัน
            </button>
            <PhotoLocationPicker
              position={measuredLocation ?? { lat: 13.7563, lon: 100.5018 }}
              onChange={updateMeasuredLocation}
            />
            <p>
              {measuredLocation
                ? `ตำแหน่งที่เลือก ${measuredLocation.lat.toFixed(5)}, ${measuredLocation.lon.toFixed(5)}`
                : "แตะแผนที่เพื่อเลือกตำแหน่ง"}
            </p>
            <details>
              <summary>ระบุพิกัดด้วยตัวเลข</summary>
              <label>
                ละติจูด
                <input
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={measuredLocation?.lat ?? ""}
                  onChange={(event) => {
                    const lat = Number(event.target.value);
                    if (
                      event.target.value &&
                      Number.isFinite(lat) &&
                      Math.abs(lat) <= 90
                    )
                      updateMeasuredLocation({
                        lat,
                        lon: measuredLocation?.lon ?? 100.5018,
                      });
                  }}
                />
              </label>
              <label>
                ลองจิจูด
                <input
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={measuredLocation?.lon ?? ""}
                  onChange={(event) => {
                    const lon = Number(event.target.value);
                    if (
                      event.target.value &&
                      Number.isFinite(lon) &&
                      Math.abs(lon) <= 180
                    )
                      updateMeasuredLocation({
                        lat: measuredLocation?.lat ?? 13.7563,
                        lon,
                      });
                  }}
                />
              </label>
            </details>
            <small>GPS ขณะส่งจะถูกเก็บแยกจากตำแหน่งที่วัด</small>
          </div>
          <details>
            <summary>ข้อมูลภาพ</summary>
            <p>
              {gallery.file.name} ·{" "}
              {(gallery.file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
              {gallery.metadata.width} × {gallery.metadata.height} px
            </p>
            <p>
              แก้ไขไฟล์เมื่อ{" "}
              {new Date(gallery.file.lastModified).toLocaleString("th-TH")}{" "}
              (ไม่ใช่เวลาถ่าย)
            </p>
            <p>
              เลือกภาพเมื่อ{" "}
              {new Date(gallery.selectedAt).toLocaleString("th-TH")}
            </p>
          </details>
          <button
            type="button"
            className="cp-focus"
            disabled={
              loading ||
              !measurementTime ||
              !measuredLocation ||
              galleryConfirmed
            }
            style={{ ...buttonStyle, background: T.teal, color: "#fff" }}
            onClick={() => void confirmGallery()}
          >
            {galleryConfirmed ? "ยืนยันภาพและเวลาแล้ว" : "ใช้ภาพและเวลานี้"}
          </button>
        </div>
      )}
      {cameraOpen && (
        <p aria-live="polite" className="cp-camera-status">
          {cameraReady
            ? `${cameraFacing === "environment" ? "กล้องหลัง" : "กล้องหน้า"}พร้อมแล้ว ถือเครื่องให้นิ่งและหลีกเลี่ยงแสงสะท้อน`
            : "กำลังเตรียมภาพจากกล้อง…"}
        </p>
      )}
      {error && (
        <p role="alert" style={{ fontSize: ".72em", color: "#c2433a" }}>
          {error}
        </p>
      )}
    </div>
  );
}
