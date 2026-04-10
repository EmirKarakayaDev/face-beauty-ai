import type { FaceShape } from "./catalog";

// MediaPipe FaceMesh 468+ nokta indeksleri
const LANDMARKS = {
  CHIN_BOTTOM: 152,
  FOREHEAD_TOP: 10,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  LEFT_JAW: 172,
  RIGHT_JAW: 397,
  LEFT_TEMPLE: 127,
  RIGHT_TEMPLE: 356,
  LEFT_FOREHEAD: 103,
  RIGHT_FOREHEAD: 332,
} as const;

interface Point {
  x: number;
  y: number;
}

type Landmark = { x: number; y: number; z: number };

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export interface FaceMetrics {
  faceLength: number;
  foreheadWidth: number;
  cheekboneWidth: number;
  jawWidth: number;
  lengthToWidth: number;
  jawToForehead: number;
  jawToCheek: number;
}

export function computeFaceMetrics(landmarks: Landmark[]): FaceMetrics {
  const get = (i: number): Point => ({ x: landmarks[i].x, y: landmarks[i].y });

  const faceLength = dist(get(LANDMARKS.FOREHEAD_TOP), get(LANDMARKS.CHIN_BOTTOM));
  const foreheadWidth = dist(get(LANDMARKS.LEFT_FOREHEAD), get(LANDMARKS.RIGHT_FOREHEAD));
  const cheekboneWidth = dist(get(LANDMARKS.LEFT_CHEEK), get(LANDMARKS.RIGHT_CHEEK));
  const jawWidth = dist(get(LANDMARKS.LEFT_JAW), get(LANDMARKS.RIGHT_JAW));
  const maxWidth = Math.max(foreheadWidth, cheekboneWidth, jawWidth);

  return {
    faceLength,
    foreheadWidth,
    cheekboneWidth,
    jawWidth,
    lengthToWidth: faceLength / maxWidth,
    jawToForehead: jawWidth / foreheadWidth,
    jawToCheek: jawWidth / cheekboneWidth,
  };
}

/**
 * Her yüz şekline 0-1 arası bir uyum skoru hesaplar.
 * Skor ne kadar yüksekse, metrikler o şekle o kadar yakın.
 */
function scoreShapes(m: FaceMetrics): Record<FaceShape, number> {
  const { lengthToWidth, jawToForehead, jawToCheek, foreheadWidth, cheekboneWidth, jawWidth } = m;

  // Yardımcı: bir değerin hedef etrafında ne kadar iyi uyuştuğunu 0-1 ile puanla
  const score = (value: number, ideal: number, tolerance: number) =>
    Math.max(0, 1 - Math.abs(value - ideal) / tolerance);

  return {
    // Uzun: lengthToWidth > 1.6 idealken yüksek, 1.4'te başlamaya başlar
    uzun: score(lengthToWidth, 1.8, 0.4),

    // Yuvarlak: lengthToWidth ~1.1, jawToCheek yüksek
    yuvarlak:
      score(lengthToWidth, 1.1, 0.2) * 0.6 +
      score(jawToCheek, 0.90, 0.15) * 0.4,

    // Kare: her üç genişlik birbirine yakın, jaw/forehead ve jaw/cheek yüksek
    kare:
      score(jawToForehead, 0.93, 0.10) * 0.4 +
      score(jawToCheek, 0.93, 0.10) * 0.4 +
      score(Math.abs(foreheadWidth - cheekboneWidth) / cheekboneWidth, 0, 0.08) * 0.2,

    // Elmas: cheekbone en geniş, forehead ve jaw belirgin dar
    elmas:
      score(cheekboneWidth / foreheadWidth, 1.15, 0.15) * 0.5 +
      score(cheekboneWidth / jawWidth, 1.15, 0.15) * 0.5,

    // Ters üçgen: forehead > jaw belirgin
    ters_ucgen: score(foreheadWidth / jawWidth, 1.22, 0.15),

    // Oval: orta uzunluk/genişlik, dengeli oranlar
    oval:
      score(lengthToWidth, 1.40, 0.20) * 0.5 +
      score(jawToForehead, 0.78, 0.12) * 0.25 +
      score(jawToCheek, 0.82, 0.12) * 0.25,
  };
}

export function classifyFaceShape(metrics: FaceMetrics): FaceShape {
  const scores = scoreShapes(metrics);
  return (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]) as FaceShape;
}

export function analyzeFaceShape(landmarks: Landmark[]): {
  shape: FaceShape;
  metrics: FaceMetrics;
} {
  const metrics = computeFaceMetrics(landmarks);
  const shape = classifyFaceShape(metrics);
  return { shape, metrics };
}
