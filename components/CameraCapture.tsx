"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

// Büyük mobil fotoğrafları küçült — iOS'ta büyük base64 string'ler state güncellemesini blokluyor
function resizeImage(file: File, maxSize = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Görsel yüklenemedi"));
    };
    img.src = objectUrl;
  });
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useMobileCamera, setUseMobileCamera] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sabit ID'ler — useId() ürettiği ":r0:" gibi değerler iOS'ta for/id eşleşmesinde sorun çıkarıyor
  const SELFIE_INPUT_ID = "beauty-selfie-input";
  const FILE_INPUT_ID = "beauty-file-input";

  useEffect(() => {
    setUseMobileCamera(
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
    );
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      // iOS'ta galeri fotoğraflarında file.type boş gelebilir — boş ise geçer, dolu ama image/* değilse reddet
      if (file.type && !file.type.startsWith("image/")) {
        setError("Lütfen geçerli bir görsel dosyası seçin.");
        return;
      }
      setError(null);
      try {
        const dataUrl = await resizeImage(file);
        onCapture(dataUrl);
      } catch {
        setError("Görsel okunamadı. Lütfen tekrar deneyin.");
      }
    },
    [onCapture]
  );

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Tarayıcınız kamera erişimini desteklemiyor.");
      return;
    }
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute("playsinline", "");
      video.muted = true;
      await video.play();
      setCameraReady(true);
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      setError(
        denied
          ? "Kamera izni reddedildi. Tarayıcı ayarlarından izin verin."
          : "Kameraya erişilemedi."
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraOpen(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setCameraOpen(false);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    stopCamera();
    onCapture(canvas.toDataURL("image/jpeg", 0.85));
  }, [onCapture, stopCamera]);

  // Desktop: live camera preview
  if (cameraOpen) {
    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto px-4">
        <div className="relative w-full rounded-2xl overflow-hidden bg-black shadow-lg aspect-[4/3]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            playsInline
            muted
            autoPlay
          />
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-64 rounded-full border-2 border-white/40 border-dashed" />
          </div>
        </div>

        <p className="text-sm text-neutral-500 text-center">
          Yüzünüzü oval çerçeve içinde ortalayın
        </p>

        <div className="flex gap-3">
          <button
            onClick={stopCamera}
            className="px-5 py-2.5 rounded-full border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            Vazgeç
          </button>
          <button
            onClick={capturePhoto}
            disabled={!cameraReady}
            className="px-8 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-neutral-700 transition-colors"
          >
            Fotoğraf Çek
          </button>
        </div>
      </div>
    );
  }

  const selfieClass =
    "w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-neutral-900 text-white font-medium hover:bg-neutral-700 active:bg-neutral-700 transition-colors cursor-pointer";

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto px-4">
      <div className="text-center mb-2">
        <div className="w-16 h-16 rounded-full bg-neutral-900 flex items-center justify-center mx-auto mb-4">
          <FaceIcon />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Beauty AI</h1>
        <p className="text-sm text-neutral-500 mt-1">Yüz şeklinize göre kişisel öneriler</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        {useMobileCamera ? (
          // Mobil: <label> ile native kamera — iOS'ta ref.click() bloklanır, label güvenlidir
          <>
            <label htmlFor={SELFIE_INPUT_ID} className={selfieClass}>
              <CameraIcon />
              <span>Selfie Çek</span>
            </label>
            <input
              id={SELFIE_INPUT_ID}
              type="file"
              accept="image/*"
              capture="user"
              className="sr-only"
              onChange={handleFileChange}
            />
          </>
        ) : (
          // Desktop: getUserMedia live preview
          <button onClick={startCamera} className={selfieClass}>
            <CameraIcon />
            <span>Selfie Çek</span>
          </button>
        )}

        <label
          htmlFor={FILE_INPUT_ID}
          className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-neutral-200 text-neutral-800 font-medium hover:bg-neutral-50 active:bg-neutral-50 transition-colors cursor-pointer"
        >
          <UploadIcon />
          <span>Fotoğraf Yükle</span>
        </label>
        <input
          id={FILE_INPUT_ID}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl px-4 py-3 border border-red-200">
          {error}
        </p>
      )}

      <p className="text-xs text-neutral-400 text-center leading-relaxed px-2">
        Fotoğrafınız cihazınızda işlenir, hiçbir yere gönderilmez.
      </p>
    </div>
  );
}

function FaceIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
