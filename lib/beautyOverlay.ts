import type { BrowRecommendation, EyelinerRecommendation, LipRecommendation } from "./catalog";

type LM = { x: number; y: number; z: number };
type Pt = { x: number; y: number };

const lp = (lm: LM[], i: number, w: number, h: number): Pt => ({
  x: lm[i].x * w,
  y: lm[i].y * h,
});

const pts = (lm: LM[], idxs: number[], w: number, h: number): Pt[] =>
  idxs.map((i) => lp(lm, i, w, h));

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Deterministic pseudo-random in [0,1] — same input always gives same output. */
function dr(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Linear interpolation along a polyline at normalized t ∈ [0,1]. */
function pathPoint(points: Pt[], t: number): Pt {
  const s = clamp(t) * (points.length - 1);
  const i = Math.min(Math.floor(s), points.length - 2);
  const f = s - i;
  return {
    x: points[i].x * (1 - f) + points[i + 1].x * f,
    y: points[i].y * (1 - f) + points[i + 1].y * f,
  };
}

/**
 * Smooth quadratic-bezier path.
 * move=true → moveTo for first point; false → lineTo (continues existing path).
 */
function smoothPath(ctx: CanvasRenderingContext2D, points: Pt[], move = true) {
  if (points.length < 2) return;
  if (move) ctx.moveTo(points[0].x, points[0].y);
  else ctx.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

// ── Eyebrow landmark indices ──────────────────────────────────────────────────
// Lower: inner→outer. Upper: outer→inner. Together they close a loop.
const L_BROW_L = [46, 53, 52, 65, 55];
const L_BROW_U = [70, 63, 105, 66, 107];
const R_BROW_L = [276, 283, 282, 295, 285];
const R_BROW_U = [300, 293, 334, 296, 336];

// ── Eye lid landmark indices ──────────────────────────────────────────────────
const L_EYE_TOP = [33, 160, 158, 133]; // inner→outer
const L_EYE_BOT = [133, 153, 144, 33]; // outer→inner
const R_EYE_TOP = [362, 385, 387, 263];
const R_EYE_BOT = [263, 373, 380, 362];

// ── Lip landmark indices ──────────────────────────────────────────────────────
const LIP_UP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const LIP_LO = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

// ── Eyebrow shape modifier ────────────────────────────────────────────────────

function modBrowUpper(
  upper: Pt[],
  shape: BrowRecommendation["shape"],
  browH: number // negative: upper is higher on screen
): Pt[] {
  const n = upper.length;
  const lift = Math.abs(browH);
  return upper.map((p, i) => {
    // t=0: outer corner, t=1: inner corner (upper goes outer→inner)
    const t = i / (n - 1);
    const arch = Math.sin(t * Math.PI);
    switch (shape) {
      case "yuksek_kavis": return { x: p.x, y: p.y - lift * 0.85 * arch };
      case "duz": {
        const avg = upper.reduce((s, q) => s + q.y, 0) / n;
        return { x: p.x, y: p.y * 0.25 + avg * 0.75 };
      }
      case "ince":   return { x: p.x, y: p.y + lift * 0.45 };
      case "kavisli": return { x: p.x, y: p.y - lift * 0.45 * arch };
      case "kalkik":  return { x: p.x, y: p.y - lift * 0.55 * (1 - t) };
      default:        return p;
    }
  });
}

// ── Eyebrow renderer ──────────────────────────────────────────────────────────

function drawBrow(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  lowerIdxs: number[],
  upperIdxs: number[],
  shape: BrowRecommendation["shape"],
  w: number,
  h: number
) {
  const lower = pts(lm, lowerIdxs, w, h);
  const upper = pts(lm, upperIdxs, w, h);
  const browH =
    upper.reduce((s, p) => s + p.y, 0) / upper.length -
    lower.reduce((s, p) => s + p.y, 0) / lower.length; // negative

  const modUpper = modBrowUpper(upper, shape, browH);

  // ── Layer 1: Soft powder base (blurred fill) ──────────────────────────────
  // Simulates the base shadow/powder under hair strands.
  ctx.save();
  ctx.filter = "blur(2.5px)";
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#1a0f06";
  ctx.beginPath();
  smoothPath(ctx, lower, true);
  smoothPath(ctx, modUpper, false);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Layer 2: Individual hair strokes ─────────────────────────────────────
  // lower is inner→outer; modUpper is outer→inner.
  // For hair at position t along the brow (0=inner, 1=outer):
  //   lPt = pathPoint(lower, t)
  //   uPt = pathPoint(modUpper, 1-t)   ← flip so both align inner→outer
  const N = 28;
  ctx.save();
  ctx.lineCap = "round";

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);

    // Jitter the sample position slightly so hairs don't stack perfectly
    const tJ = clamp(t + (dr(i * 7 + 1) - 0.5) * 0.09);
    const lPt = pathPoint(lower, tJ);
    const uPt = pathPoint(modUpper, 1 - tJ);

    // Each hair starts near the lower edge and reaches near the upper edge
    const startFrac = 0.06 + dr(i * 3 + 2) * 0.20;
    const endFrac   = 0.74 + dr(i * 5 + 3) * 0.22;

    // Perpendicular jitter for natural hair deviation
    const dx = uPt.x - lPt.x;
    const dy = uPt.y - lPt.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;
    const perpY =  dx / len;
    const jitter = (dr(i * 11 + 4) - 0.5) * Math.abs(browH) * 0.28;

    const sx = lPt.x + dx * startFrac + perpX * jitter;
    const sy = lPt.y + dy * startFrac + perpY * jitter;
    const ex = lPt.x + dx * endFrac   + perpX * jitter * 0.35;
    const ey = lPt.y + dy * endFrac   + perpY * jitter * 0.35;

    ctx.strokeStyle = `rgba(26, 16, 6, ${(0.52 + dr(i * 13 + 5) * 0.42).toFixed(2)})`;
    ctx.lineWidth = 0.38 + dr(i * 17 + 6) * 0.95;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Eyeliner renderer ─────────────────────────────────────────────────────────

function drawEyeliner(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  topIdxs: number[],
  botIdxs: number[],
  style: EyelinerRecommendation["style"],
  w: number,
  h: number
) {
  const top = pts(lm, topIdxs, w, h);
  const bot = pts(lm, botIdxs, w, h);
  const eyeW = Math.abs(top[top.length - 1].x - top[0].x);

  const maxLW =
    style === "dramatik"                          ? eyeW * 0.092
    : style === "klasik" || style === "cat_eye"  ? eyeW * 0.062
    : eyeW * 0.038; // ince_dogal

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(6, 4, 12, 0.90)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.40)";
  ctx.shadowBlur = 3;

  // Upper lid: tapered — thin at inner corner, full width at outer corner
  for (let i = 0; i < top.length - 1; i++) {
    const t = i / (top.length - 1); // 0=inner, 1=outer
    const taper = 0.22 + 0.78 * t;
    ctx.lineWidth = maxLW * taper;
    ctx.beginPath();
    ctx.moveTo(top[i].x, top[i].y);
    ctx.lineTo(top[i + 1].x, top[i + 1].y);
    ctx.stroke();
  }

  // Cat-eye wing
  if (style === "cat_eye") {
    const outer = top[top.length - 1];
    const prev  = top[top.length - 2];
    const angle = Math.atan2(outer.y - prev.y, outer.x - prev.x) - Math.PI / 5.5;
    const wingLen = eyeW * 0.22;
    ctx.lineWidth = maxLW * 0.50;
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.lineTo(
      outer.x + Math.cos(angle) * wingLen,
      outer.y + Math.sin(angle) * wingLen
    );
    ctx.stroke();
  }

  // Lower lid for alt_hat — tapered in reverse
  if (style === "alt_hat") {
    ctx.shadowBlur = 2;
    for (let i = 0; i < bot.length - 1; i++) {
      const t = i / (bot.length - 1); // 0=outer, 1=inner
      const taper = 0.22 + 0.78 * (1 - t);
      ctx.lineWidth = maxLW * 0.46 * taper;
      ctx.beginPath();
      ctx.moveTo(bot[i].x, bot[i].y);
      ctx.lineTo(bot[i + 1].x, bot[i + 1].y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── Lip renderer ──────────────────────────────────────────────────────────────

function buildLipPath(
  ctx: CanvasRenderingContext2D,
  modUp: Pt[],
  modLo: Pt[]
) {
  ctx.beginPath();
  smoothPath(ctx, modUp, true);
  smoothPath(ctx, modLo, false);
  ctx.closePath();
}

function drawLips(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  style: LipRecommendation["style"],
  w: number,
  h: number
) {
  const upper = pts(lm, LIP_UP, w, h);
  const lower = pts(lm, LIP_LO, w, h);
  const lipW  = Math.abs(upper[upper.length - 1].x - upper[0].x);

  // Style-specific shape adjustments
  const modUp = upper.map((p, i) => {
    const t = i / (upper.length - 1);
    const c = Math.sin(t * Math.PI);
    switch (style) {
      case "belirgin_cupid": return { x: p.x, y: p.y - lipW * 0.022 * c };
      case "dolu":           return { x: p.x, y: p.y - lipW * 0.032 * c };
      case "uzatilmis": {
        const edge = t < 0.09 ? (0.09 - t) / 0.09 : t > 0.91 ? (t - 0.91) / 0.09 : 0;
        return { x: p.x + (t < 0.5 ? -1 : 1) * lipW * 0.042 * edge, y: p.y };
      }
      case "yuvarlak": return { x: p.x, y: p.y - lipW * 0.018 * c };
      default:         return p;
    }
  });

  const modLo = lower.map((p, i) => {
    const t = i / (lower.length - 1);
    const c = Math.sin(t * Math.PI);
    switch (style) {
      case "dolu":    return { x: p.x, y: p.y + lipW * 0.032 * c };
      case "uzatilmis": {
        const edge = t < 0.09 ? (0.09 - t) / 0.09 : t > 0.91 ? (t - 0.91) / 0.09 : 0;
        return { x: p.x + (t < 0.5 ? 1 : -1) * lipW * 0.042 * edge, y: p.y };
      }
      case "yuvarlak": return { x: p.x, y: p.y + lipW * 0.018 * c };
      default:         return p;
    }
  });

  const allPts = [...modUp, ...modLo];
  const minX = Math.min(...allPts.map((p) => p.x));
  const maxX = Math.max(...allPts.map((p) => p.x));
  const minY = Math.min(...allPts.map((p) => p.y));
  const maxY = Math.max(...allPts.map((p) => p.y));
  const cx   = (minX + maxX) / 2;
  const lipH = maxY - minY;

  // ── Layer 1: Multiply base — color mixes with the skin tone naturally ──────
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.70;
  buildLipPath(ctx, modUp, modLo);
  ctx.fillStyle = "rgb(225, 88, 108)";
  ctx.fill();
  ctx.restore();

  // ── Layer 2: Gradient fill — gives depth (darker at top and bottom) ────────
  const grad = ctx.createLinearGradient(cx, minY, cx, maxY);
  grad.addColorStop(0,    "rgba(230, 95, 115, 0.28)");
  grad.addColorStop(0.38, "rgba(205, 68,  88, 0.15)");
  grad.addColorStop(1,    "rgba(155, 38,  55, 0.32)");

  ctx.save();
  buildLipPath(ctx, modUp, modLo);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // ── Layer 3: Lip liner ────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = "rgba(138, 32, 52, 0.62)";
  ctx.lineWidth = Math.max(0.7, lipW * 0.013);
  ctx.lineJoin = "round";
  ctx.lineCap  = "round";
  buildLipPath(ctx, modUp, modLo);
  ctx.stroke();
  ctx.restore();

  // ── Layer 4: Shine highlight (screen blend) ───────────────────────────────
  // Concentrated on upper third of the lip area → "gloss" look
  const shine = ctx.createLinearGradient(cx, minY, cx, minY + lipH * 0.48);
  shine.addColorStop(0,   "rgba(255, 255, 255, 0.24)");
  shine.addColorStop(0.5, "rgba(255, 255, 255, 0.08)");
  shine.addColorStop(1,   "rgba(255, 255, 255, 0)");

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  buildLipPath(ctx, modUp, modLo);
  ctx.fillStyle = shine;
  ctx.fill();
  ctx.restore();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function drawBeautyOverlay(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  brow: BrowRecommendation,
  eyeliner: EyelinerRecommendation,
  lip: LipRecommendation,
  w: number,
  h: number
) {
  drawBrow(ctx, lm, L_BROW_L, L_BROW_U, brow.shape, w, h);
  drawBrow(ctx, lm, R_BROW_L, R_BROW_U, brow.shape, w, h);
  drawEyeliner(ctx, lm, L_EYE_TOP, L_EYE_BOT, eyeliner.style, w, h);
  drawEyeliner(ctx, lm, R_EYE_TOP, R_EYE_BOT, eyeliner.style, w, h);
  drawLips(ctx, lm, lip.style, w, h);
}
