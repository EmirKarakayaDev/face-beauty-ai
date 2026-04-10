import type { BrowRecommendation, EyelinerRecommendation, LipRecommendation } from "./catalog";

type LM = { x: number; y: number; z: number };
type Pt = { x: number; y: number };

const lp = (lm: LM[], i: number, w: number, h: number): Pt => ({
  x: lm[i].x * w,
  y: lm[i].y * h,
});

const pts = (lm: LM[], idxs: number[], w: number, h: number): Pt[] =>
  idxs.map((i) => lp(lm, i, w, h));

/**
 * Smooth quadratic-bezier path through points.
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
// Lower edge goes inner→outer; upper edge goes outer→inner.
// Concatenated they form a closed outline (inner-bot → outer-bot → outer-top → inner-top).
const L_BROW_L = [46, 53, 52, 65, 55];      // left lower  inner→outer
const L_BROW_U = [70, 63, 105, 66, 107];    // left upper  outer→inner
const R_BROW_L = [276, 283, 282, 295, 285]; // right lower inner→outer
const R_BROW_U = [300, 293, 334, 296, 336]; // right upper outer→inner

// ── Eye lid landmark indices ──────────────────────────────────────────────────
const L_EYE_TOP = [33, 160, 158, 133]; // left  upper lid  inner→outer
const L_EYE_BOT = [133, 153, 144, 33]; // left  lower lid  outer→inner
const R_EYE_TOP = [362, 385, 387, 263]; // right upper lid  inner→outer
const R_EYE_BOT = [263, 373, 380, 362]; // right lower lid  outer→inner

// ── Lip landmark indices ──────────────────────────────────────────────────────
const LIP_UP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]; // left corner → right corner
const LIP_LO = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61]; // right corner → left corner

// ── Eyebrow ───────────────────────────────────────────────────────────────────

function modBrowUpper(
  upper: Pt[],
  shape: BrowRecommendation["shape"],
  browH: number // negative: upper sits above lower in screen-y
): Pt[] {
  const n = upper.length;
  const lift = Math.abs(browH);
  return upper.map((p, i) => {
    const t = i / (n - 1); // t=0: outer corner, t=1: inner corner
    const arch = Math.sin(t * Math.PI); // 0 at edges, max at middle
    switch (shape) {
      case "yuksek_kavis":
        return { x: p.x, y: p.y - lift * 0.85 * arch };
      case "duz": {
        const avg = upper.reduce((s, q) => s + q.y, 0) / n;
        return { x: p.x, y: p.y * 0.25 + avg * 0.75 };
      }
      case "ince":
        return { x: p.x, y: p.y + lift * 0.45 }; // moves toward lower edge → thinner
      case "kavisli":
        return { x: p.x, y: p.y - lift * 0.45 * arch };
      case "kalkik":
        return { x: p.x, y: p.y - lift * 0.55 * (1 - t) }; // outer (t=0) gets max lift
      default: // dogal
        return p;
    }
  });
}

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

  ctx.save();
  ctx.beginPath();
  smoothPath(ctx, lower, true);      // inner-bot → outer-bot
  smoothPath(ctx, modUpper, false);  // outer-top → inner-top  (lineTo from outer-bot)
  ctx.closePath();                    // inner-top → inner-bot (straight cap)
  ctx.fillStyle = "rgba(22, 14, 6, 0.65)";
  ctx.fill();
  ctx.restore();
}

// ── Eyeliner ──────────────────────────────────────────────────────────────────

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

  const lw =
    style === "dramatik" ? eyeW * 0.088
    : style === "klasik" || style === "cat_eye" ? eyeW * 0.058
    : eyeW * 0.036; // ince_dogal

  ctx.save();
  ctx.strokeStyle = "rgba(8, 6, 14, 0.85)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;

  // Upper lid line
  ctx.beginPath();
  smoothPath(ctx, top, true);
  ctx.stroke();

  // Cat-eye wing from outer corner
  if (style === "cat_eye") {
    const outer = top[top.length - 1];
    const prev = top[top.length - 2];
    const angle = Math.atan2(outer.y - prev.y, outer.x - prev.x) - Math.PI / 5.5;
    const wingLen = eyeW * 0.22;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.lineTo(outer.x + Math.cos(angle) * wingLen, outer.y + Math.sin(angle) * wingLen);
    ctx.lineWidth = lw * 0.52;
    ctx.stroke();
  }

  // Lower lid line for alt_hat style
  if (style === "alt_hat") {
    ctx.lineWidth = lw * 0.48;
    ctx.beginPath();
    smoothPath(ctx, bot, true);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Lips ──────────────────────────────────────────────────────────────────────

function drawLips(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  style: LipRecommendation["style"],
  w: number,
  h: number
) {
  const upper = pts(lm, LIP_UP, w, h);
  const lower = pts(lm, LIP_LO, w, h);
  const lipW = Math.abs(upper[upper.length - 1].x - upper[0].x);

  const modUp = upper.map((p, i) => {
    const t = i / (upper.length - 1);
    const c = Math.sin(t * Math.PI); // 0 at corners, 1 at center
    switch (style) {
      case "belirgin_cupid": return { x: p.x, y: p.y - lipW * 0.022 * c };
      case "dolu":           return { x: p.x, y: p.y - lipW * 0.032 * c };
      case "uzatilmis": {
        const edge = t < 0.09 ? (0.09 - t) / 0.09 : t > 0.91 ? (t - 0.91) / 0.09 : 0;
        return { x: p.x + (t < 0.5 ? -1 : 1) * lipW * 0.042 * edge, y: p.y };
      }
      case "yuvarlak": return { x: p.x, y: p.y - lipW * 0.018 * c };
      default: return p;
    }
  });

  const modLo = lower.map((p, i) => {
    const t = i / (lower.length - 1); // t=0: right corner, t=1: left corner
    const c = Math.sin(t * Math.PI);
    switch (style) {
      case "dolu": return { x: p.x, y: p.y + lipW * 0.032 * c };
      case "uzatilmis": {
        const edge = t < 0.09 ? (0.09 - t) / 0.09 : t > 0.91 ? (t - 0.91) / 0.09 : 0;
        return { x: p.x + (t < 0.5 ? 1 : -1) * lipW * 0.042 * edge, y: p.y };
      }
      case "yuvarlak": return { x: p.x, y: p.y + lipW * 0.018 * c };
      default: return p;
    }
  });

  ctx.save();
  ctx.beginPath();
  smoothPath(ctx, modUp, true);  // left corner → right corner
  smoothPath(ctx, modLo, false); // right corner → left corner (lineTo continues)
  ctx.closePath();
  ctx.fillStyle = "rgba(192, 68, 88, 0.43)";
  ctx.fill();
  ctx.strokeStyle = "rgba(155, 45, 62, 0.58)";
  ctx.lineWidth = Math.max(0.8, lipW * 0.013);
  ctx.lineJoin = "round";
  ctx.stroke();
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
