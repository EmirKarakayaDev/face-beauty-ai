"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { analyzeFaceShape } from "@/lib/faceShape";
import { analyzeColors, getColorAdvice } from "@/lib/colorAnalysis";
import { getRecommendation } from "@/lib/catalog";
import type { FaceShape } from "@/lib/catalog";
import { drawBeautyOverlay } from "@/lib/beautyOverlay";
import ResultCard from "./ResultCard";

// Oturum boyunca tek model instance — her fotoğrafta yeniden yüklenmiyor
let landmarkerSingleton: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker> | null = null;

async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerSingleton) return landmarkerSingleton;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    const baseOptions = {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    };
    const commonOptions = {
      runningMode: "IMAGE" as const,
      numFaces: 1,
      outputFaceBlendshapes: false,
    };

    try {
      // Önce GPU dene
      landmarkerSingleton = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: "GPU" },
        ...commonOptions,
      });
    } catch {
      // GPU kullanılamıyorsa CPU'ya geri dön
      landmarkerSingleton = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: "CPU" },
        ...commonOptions,
      });
    }

    return landmarkerSingleton;
  })();

  return initPromise;
}

interface FaceAnalyzerProps {
  imageDataUrl: string;
  onReset: () => void;
}

type AnalysisState =
  | { status: "loading" }
  | { status: "analyzing" }
  | { status: "done"; faceShape: FaceShape; colorAdvice: string }
  | { status: "error"; message: string };

type Landmark = { x: number; y: number; z: number };

export default function FaceAnalyzer({ imageDataUrl, onReset }: FaceAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const landmarksRef = useRef<Landmark[] | null>(null);
  const faceShapeRef = useRef<FaceShape | null>(null);

  const [state, setState] = useState<AnalysisState>({ status: "loading" });
  const [overlayVisible, setOverlayVisible] = useState(true);

  const runAnalysis = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setState({ status: "loading" });

      // Görüntüyü önce canvas'a çiz — kullanıcı model yüklenirken fotoğrafını görür
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageDataUrl;
      });

      const maxSize = 640;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Model singleton'ı al (ilk çağrıda yükler, sonrasında cache'den döner)
      const landmarker = await getFaceLandmarker();

      setState({ status: "analyzing" });

      const result: FaceLandmarkerResult = landmarker.detect(canvas);

      if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
        setState({
          status: "error",
          message: "Yüz tespit edilemedi.",
        });
        return;
      }

      const landmarks = result.faceLandmarks[0];
      const { shape } = analyzeFaceShape(landmarks);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const colorProfile = analyzeColors(imageData, landmarks, canvas.width, canvas.height);
      const colorAdvice = getColorAdvice(colorProfile);

      // Beauty overlay — önerilen kaş/eyeliner/dudak şekli yüzün üzerine çizilir
      const rec = getRecommendation(shape);
      drawBeautyOverlay(ctx, landmarks, rec.brow, rec.eyeliner, rec.lip, canvas.width, canvas.height);

      // Redraw için referansları sakla
      imgRef.current = img;
      landmarksRef.current = landmarks;
      faceShapeRef.current = shape;

      setState({ status: "done", faceShape: shape, colorAdvice });
    } catch (err) {
      console.error(err);
      setState({
        status: "error",
        message: "Analiz sırasında beklenmedik bir hata oluştu.",
      });
    }
  }, [imageDataUrl]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const handleToggleOverlay = useCallback(() => {
    setOverlayVisible((prev) => {
      const next = !prev;
      const canvas = canvasRef.current;
      const img = imgRef.current;
      const lm = landmarksRef.current;
      const shape = faceShapeRef.current;
      if (canvas && img && lm && shape) {
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        if (next) {
          const rec = getRecommendation(shape);
          drawBeautyOverlay(ctx, lm, rec.brow, rec.eyeliner, rec.lip, canvas.width, canvas.height);
        }
      }
      return next;
    });
  }, []);

  const isProcessing = state.status === "loading" || state.status === "analyzing";
  const showCanvas = state.status === "done";

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto px-4">
      <div className="relative rounded-2xl overflow-hidden shadow-lg border border-neutral-200 dark:border-neutral-700 bg-black w-full">
        {/* Fotoğraf: canvas hazır olana kadar göster, hata durumunda da kalsın */}
        {!showCanvas && (
          <img
            src={imageDataUrl}
            alt="Analiz ediliyor"
            className="w-full max-h-[70vh] object-contain"
          />
        )}
        {/* Canvas: sadece analiz bitince göster */}
        <canvas ref={canvasRef} className={showCanvas ? "max-w-full" : "hidden"} />

        {isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 gap-3">
            <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-white text-sm font-medium drop-shadow">
              {state.status === "loading" ? "Model yükleniyor…" : "Yüz analiz ediliyor…"}
            </p>
          </div>
        )}
      </div>

      {/* Hata */}
      {state.status === "error" && (
        <div className="w-full rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-400">
          <p className="font-semibold mb-1">Analiz başarısız</p>
          <p className="mb-2">{state.message}</p>
          <ul className="list-disc list-inside space-y-0.5 text-red-600 dark:text-red-400">
            <li>Yüzünüz kameraya doğrudan bakmalı</li>
            <li>Iyi aydınlatma sağlayın, arka plan sade olsun</li>
            <li>Yüzün tamamı çerçeve içinde görünmeli</li>
          </ul>
        </div>
      )}

      {/* Sonuç */}
      {state.status === "done" && (
        <ResultCard
          recommendation={getRecommendation(state.faceShape)}
          colorAdvice={state.colorAdvice}
        />
      )}

      <div className="flex gap-3 mt-2">
        {state.status === "done" && (
          <button
            onClick={handleToggleOverlay}
            className="px-5 py-2.5 rounded-full border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            {overlayVisible ? "Orijinal Göster" : "Makyajı Göster"}
          </button>
        )}
        <button
          onClick={onReset}
          className="px-6 py-2.5 rounded-full border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          Yeni Fotoğraf
        </button>
      </div>
    </div>
  );
}
