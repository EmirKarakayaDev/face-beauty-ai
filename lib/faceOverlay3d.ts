import * as THREE from "three";
import type { BrowRecommendation, EyelinerRecommendation, LipRecommendation } from "./catalog";

type LM = { x: number; y: number; z: number };
type Pt = { x: number; y: number };

// ── Coordinate helpers ────────────────────────────────────────────────────────

const lp = (lm: LM[], i: number, w: number, h: number): Pt => ({
  x: lm[i].x * w,
  y: lm[i].y * h,
});
const pts = (lm: LM[], idxs: number[], w: number, h: number): Pt[] =>
  idxs.map((i) => lp(lm, i, w, h));

// Three.js is Y-up; canvas is Y-down. Flip Y when moving between them.
const fy = (p: Pt, h: number): Pt => ({ x: p.x, y: h - p.y });
const fyAll = (ps: Pt[], h: number): Pt[] => ps.map((p) => fy(p, h));

// ── Deterministic pseudo-random ───────────────────────────────────────────────
function dr(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

// ── Smooth quadratic bezier on a THREE.Shape / THREE.Path ────────────────────
function smoothShape(
  target: THREE.Shape | THREE.Path,
  points: Pt[],
  move = true
) {
  if (points.length < 2) return;
  if (move) target.moveTo(points[0].x, points[0].y);
  else target.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    target.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  target.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

// ── Landmark index groups ─────────────────────────────────────────────────────
const L_BROW_L = [46, 53, 52, 65, 55];   // lower edge inner→outer
const L_BROW_U = [70, 63, 105, 66, 107]; // upper edge outer→inner
const R_BROW_L = [276, 283, 282, 295, 285];
const R_BROW_U = [300, 293, 334, 296, 336];

const L_EYE_TOP = [133, 158, 160, 33];  // inner→outer (33=temporal outer corner)
const L_EYE_BOT = [33, 144, 153, 133];  // outer→inner
const R_EYE_TOP = [362, 385, 387, 263];
const R_EYE_BOT = [263, 373, 380, 362];

const LIP_UP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const LIP_LO = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

// ── Brow shape modifier (Three.js Y-up space) ─────────────────────────────────
// upper array is outer→inner; t=0 is outer corner, t=1 is inner.
// In Y-up space "lifting" the brow means +Y.
function modBrowUpper(
  upper: Pt[],
  shape: BrowRecommendation["shape"],
  browH: number // positive: upper sits above lower
): Pt[] {
  const n = upper.length;
  const lift = Math.abs(browH);
  return upper.map((p, i) => {
    const t = i / (n - 1);
    const arch = Math.sin(t * Math.PI);
    switch (shape) {
      case "yuksek_kavis": return { x: p.x, y: p.y + lift * 0.85 * arch };
      case "duz": {
        const avg = upper.reduce((s, q) => s + q.y, 0) / n;
        return { x: p.x, y: p.y * 0.25 + avg * 0.75 };
      }
      case "ince":    return { x: p.x, y: p.y - lift * 0.45 };
      case "kavisli": return { x: p.x, y: p.y + lift * 0.45 * arch };
      case "kalkik":  return { x: p.x, y: p.y + lift * 0.55 * (1 - t) };
      default:        return p;
    }
  });
}

// ── Brow hair texture ─────────────────────────────────────────────────────────
// Draws hair strokes onto an offscreen canvas and returns it as a Three.js
// CanvasTexture. Because THREE.CanvasTexture has flipY=true, canvas Y=0 (top)
// maps to UV.y=1 (top of brow in Y-up) and canvas Y=texH maps to UV.y=0 (brow
// bottom). So startY≈texH → brow bottom and endY≈0 → brow top: correct
// direction for hair growing upward from skin.
function makeBrowTexture(texW: number, texH: number, seed: number): THREE.CanvasTexture {
  const tc = document.createElement("canvas");
  tc.width  = Math.max(1, texW);
  tc.height = Math.max(1, texH);
  const tctx = tc.getContext("2d")!;

  const N = 110;
  for (let i = 0; i < N; i++) {
    // Spread evenly across the brow width with slight jitter
    const tx   = (dr(seed + i * 2) * 1.08 - 0.04) * texW;
    const startY = texH * (0.88 + dr(seed + i * 7)  * 0.12);
    const endY   = texH * (0.02 + dr(seed + i * 11) * 0.22);
    // Control point for gentle curve
    const cpX  = tx + (dr(seed + i * 17) - 0.5) * texW * 0.05;
    const cpY  = startY * 0.35 + endY * 0.65;
    const alpha = 0.36 + dr(seed + i * 19) * 0.54;
    const lw    = 0.45 + dr(seed + i * 23) * 1.55;

    tctx.strokeStyle = `rgba(22, 12, 4, ${alpha.toFixed(2)})`;
    tctx.lineWidth   = lw;
    tctx.lineCap     = "round";
    tctx.beginPath();
    tctx.moveTo(tx, startY);
    tctx.quadraticCurveTo(cpX, cpY, tx + (dr(seed + i * 29) - 0.5) * texW * 0.04, endY);
    tctx.stroke();
  }

  return new THREE.CanvasTexture(tc);
}

// ── Three.js renderer singleton ───────────────────────────────────────────────
let _renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    _renderer.setClearColor(0x000000, 0);
  }
  return _renderer;
}

// Orthographic camera mapping pixel coords directly (Y-flipped).
// Place objects at Three.js coords: x = canvas_x, y = canvas_h - canvas_y
function makeCamera(w: number, h: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(0, w, h, 0, -200, 200);
  // Camera must be at origin (not w/2, h/2) so the frustum maps pixel coords 1:1.
  // With position=(0,0,100) and default look direction (-Z):
  //   world_x → NDC_x = 2*x/w - 1  (x=0 → -1 left edge, x=w → 1 right edge) ✓
  //   world_y = h-canvas_y → NDC_y = 2*(h-y)/h - 1  (y=0 top → 1, y=h bottom → -1) ✓
  cam.position.set(0, 0, 100);
  return cam;
}

// ── Brow renderer ─────────────────────────────────────────────────────────────
function drawBrow3d(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  lowerIdxs: number[],
  upperIdxs: number[],
  shape: BrowRecommendation["shape"],
  w: number,
  h: number,
  texSeed: number,
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera
) {
  const lower = fyAll(pts(lm, lowerIdxs, w, h), h);
  const upper = fyAll(pts(lm, upperIdxs, w, h), h);

  // browH > 0 means upper sits above lower in Three.js Y-up
  const browH =
    upper.reduce((s, p) => s + p.y, 0) / upper.length -
    lower.reduce((s, p) => s + p.y, 0) / lower.length;

  const modUpper = modBrowUpper(upper, shape, browH);

  // Brow outline: inner→outer along lower, then outer→inner along upper
  const browShape = new THREE.Shape();
  smoothShape(browShape, lower, true);    // lower edge inner→outer
  smoothShape(browShape, modUpper, false); // upper edge outer→inner (continues)
  browShape.closePath();

  // Bounding box for texture sizing
  const allPts  = [...lower, ...modUpper];
  const texW    = Math.ceil(Math.max(1, Math.max(...allPts.map((p) => p.x)) - Math.min(...allPts.map((p) => p.x))));
  const texH    = Math.ceil(Math.max(1, Math.max(...allPts.map((p) => p.y)) - Math.min(...allPts.map((p) => p.y))));

  renderer.setSize(w, h);

  // ── Layer 1: Blurred soft base ─────────────────────────────────────────────
  {
    const scene   = new THREE.Scene();
    const geo     = new THREE.ShapeGeometry(browShape);
    const mat     = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.102, 0.063, 0.024),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(geo, mat));
    renderer.clear();
    renderer.render(scene, camera);

    ctx.save();
    ctx.filter = "blur(3px)";
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(renderer.domElement, 0, 0);
    ctx.restore();

    mat.dispose();
    geo.dispose();
  }

  // ── Layer 2: Hair texture ──────────────────────────────────────────────────
  {
    const tex   = makeBrowTexture(texW, texH, texSeed);
    const scene = new THREE.Scene();
    const geo   = new THREE.ShapeGeometry(browShape);
    const mat   = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      alphaTest: 0.005,
    });
    scene.add(new THREE.Mesh(geo, mat));
    renderer.clear();
    renderer.render(scene, camera);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(renderer.domElement, 0, 0);
    ctx.restore();

    mat.dispose();
    geo.dispose();
    tex.dispose();
  }
}

// ── Eyeliner (Canvas 2D — thin lines don't benefit from 3D) ──────────────────
function drawEyeliner(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  topIdxs: number[],
  botIdxs: number[],
  style: EyelinerRecommendation["style"],
  w: number,
  h: number
) {
  const top  = pts(lm, topIdxs, w, h);
  const bot  = pts(lm, botIdxs, w, h);
  const eyeW = Math.abs(top[top.length - 1].x - top[0].x);

  const maxLW =
    style === "dramatik"                         ? eyeW * 0.092
    : style === "klasik" || style === "cat_eye" ? eyeW * 0.062
    : eyeW * 0.038;

  ctx.save();
  ctx.lineCap    = "round";
  ctx.lineJoin   = "round";
  ctx.strokeStyle = "rgba(6, 4, 12, 0.90)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.40)";
  ctx.shadowBlur  = 3;

  // Upper lid tapered inner→outer
  for (let i = 0; i < top.length - 1; i++) {
    const t = i / (top.length - 1);
    ctx.lineWidth = maxLW * (0.22 + 0.78 * t);
    ctx.beginPath();
    ctx.moveTo(top[i].x, top[i].y);
    ctx.lineTo(top[i + 1].x, top[i + 1].y);
    ctx.stroke();
  }

  // Cat-eye wing
  if (style === "cat_eye") {
    const outer  = top[top.length - 1];
    const prev   = top[top.length - 2];
    const angle  = Math.atan2(outer.y - prev.y, outer.x - prev.x) - Math.PI / 5.5;
    const wingLen = eyeW * 0.22;
    ctx.lineWidth  = maxLW * 0.50;
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.lineTo(outer.x + Math.cos(angle) * wingLen, outer.y + Math.sin(angle) * wingLen);
    ctx.stroke();
  }

  // Lower lid for alt_hat
  if (style === "alt_hat") {
    ctx.shadowBlur = 2;
    for (let i = 0; i < bot.length - 1; i++) {
      const t = i / (bot.length - 1);
      ctx.lineWidth = maxLW * 0.46 * (0.22 + 0.78 * (1 - t));
      ctx.beginPath();
      ctx.moveTo(bot[i].x, bot[i].y);
      ctx.lineTo(bot[i + 1].x, bot[i + 1].y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

// ── Lip shape modifiers (Three.js Y-up: up = +Y, down = -Y) ──────────────────
function modLipUpper(points: Pt[], style: LipRecommendation["style"], lipW: number): Pt[] {
  return points.map((p, i) => {
    const t = i / (points.length - 1);
    const c = Math.sin(t * Math.PI);
    switch (style) {
      case "belirgin_cupid": return { x: p.x, y: p.y + lipW * 0.022 * c };
      case "dolu":           return { x: p.x, y: p.y + lipW * 0.032 * c };
      case "uzatilmis": {
        const edge = t < 0.09 ? (0.09 - t) / 0.09 : t > 0.91 ? (t - 0.91) / 0.09 : 0;
        return { x: p.x + (t < 0.5 ? -1 : 1) * lipW * 0.042 * edge, y: p.y };
      }
      case "yuvarlak": return { x: p.x, y: p.y + lipW * 0.018 * c };
      default:         return p;
    }
  });
}

function modLipLower(points: Pt[], style: LipRecommendation["style"], lipW: number): Pt[] {
  return points.map((p, i) => {
    const t = i / (points.length - 1);
    const c = Math.sin(t * Math.PI);
    switch (style) {
      case "dolu":    return { x: p.x, y: p.y - lipW * 0.032 * c };
      case "uzatilmis": {
        const edge = t < 0.09 ? (0.09 - t) / 0.09 : t > 0.91 ? (t - 0.91) / 0.09 : 0;
        return { x: p.x + (t < 0.5 ? 1 : -1) * lipW * 0.042 * edge, y: p.y };
      }
      case "yuvarlak": return { x: p.x, y: p.y - lipW * 0.018 * c };
      default:         return p;
    }
  });
}

// ── Lip renderer (Three.js ExtrudeGeometry for 3D volume) ────────────────────
function drawLips3d(
  ctx: CanvasRenderingContext2D,
  lm: LM[],
  style: LipRecommendation["style"],
  w: number,
  h: number,
  renderer: THREE.WebGLRenderer,
  camera: THREE.OrthographicCamera
) {
  const upperRaw = pts(lm, LIP_UP, w, h);
  const lowerRaw = pts(lm, LIP_LO, w, h);
  const lipW     = Math.abs(upperRaw[upperRaw.length - 1].x - upperRaw[0].x);

  // Flip Y for Three.js
  const upper = fyAll(upperRaw, h);
  const lower = fyAll(lowerRaw, h);

  const modUp = modLipUpper(upper, style, lipW);
  const modLo = modLipLower(lower, style, lipW);

  // Closed lip outline shape
  const lipShape = new THREE.Shape();
  smoothShape(lipShape, modUp, true);   // upper lip left→right
  smoothShape(lipShape, modLo, false);  // lower lip continues right→left
  lipShape.closePath();

  renderer.setSize(w, h);

  // ── Layer 1: 3D extruded base (multiply blend) ────────────────────────────
  {
    const depth  = clamp(lipW * 0.07, 4, 20);
    const bSize  = clamp(lipW * 0.028, 1.5, 8);
    const bThick = clamp(lipW * 0.035, 2, 10);

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: true,
      bevelSegments: 4,
      bevelSize:      bSize,
      bevelThickness: bThick,
      bevelOffset:    0,
    };

    const scene   = new THREE.Scene();
    const ambient = new THREE.AmbientLight(0xffffff, 0.60);
    scene.add(ambient);

    // Main front light — highlights the forward-facing extruded surface
    const front = new THREE.DirectionalLight(0xffffff, 1.0);
    front.position.set(w * 0.5, h * 1.3, 180);
    scene.add(front);

    // Soft fill from below for the lower lip
    const fill = new THREE.DirectionalLight(0xfffaf8, 0.30);
    fill.position.set(w * 0.5, h * -0.3, 100);
    scene.add(fill);

    const geo = new THREE.ExtrudeGeometry(lipShape, extrudeSettings);
    const mat = new THREE.MeshPhongMaterial({
      color:    new THREE.Color(0.882, 0.345, 0.424),
      specular: new THREE.Color(1.0, 0.85, 0.85),
      shininess: 90,
      transparent: true,
      opacity:     0.80,
      depthWrite:  false,
      side: THREE.FrontSide,
    });
    scene.add(new THREE.Mesh(geo, mat));

    renderer.clear();
    renderer.render(scene, camera);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(renderer.domElement, 0, 0);
    ctx.restore();

    mat.dispose();
    geo.dispose();
  }

  // ── Layer 2: Gradient depth fill (normal blend) ────────────────────────────
  {
    const allLipPts = [...modUp, ...modLo];
    const minX = Math.min(...allLipPts.map((p) => p.x));
    const maxX = Math.max(...allLipPts.map((p) => p.x));
    const minY = Math.min(...allLipPts.map((p) => p.y));
    const maxY = Math.max(...allLipPts.map((p) => p.y));
    const cx   = (minX + maxX) / 2;
    // In Three.js Y-up, minY = lip bottom (screen bottom), maxY = lip top
    // Gradient from bottom (minY) to top (maxY)
    const grad = ctx.createLinearGradient(cx, h - minY, cx, h - maxY);
    grad.addColorStop(0,    "rgba(230, 95, 115, 0.28)");
    grad.addColorStop(0.38, "rgba(205, 68,  88, 0.14)");
    grad.addColorStop(1,    "rgba(155, 38,  55, 0.30)");

    // Draw the lip path directly on canvas for gradient
    ctx.save();
    ctx.beginPath();
    const upCanvas = modUp.map((p) => fy(p, h));
    const loCanvas = modLo.map((p) => fy(p, h));
    upCanvas.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const nx = upCanvas[Math.min(i + 1, upCanvas.length - 1)];
        const mx = (p.x + nx.x) / 2;
        const my = (p.y + nx.y) / 2;
        if (i < upCanvas.length - 1) ctx.quadraticCurveTo(p.x, p.y, mx, my);
        else ctx.lineTo(p.x, p.y);
      }
    });
    loCanvas.slice(1).forEach((p, i) => {
      const idx = i + 1;
      const nx  = loCanvas[Math.min(idx + 1, loCanvas.length - 1)];
      const mx  = (p.x + nx.x) / 2;
      const my  = (p.y + nx.y) / 2;
      if (idx < loCanvas.length - 1) ctx.quadraticCurveTo(p.x, p.y, mx, my);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // ── Layer 3: Lip liner ─────────────────────────────────────────────────────
  {
    const upCanvas = modUp.map((p) => fy(p, h));
    const loCanvas = modLo.map((p) => fy(p, h));

    ctx.save();
    ctx.beginPath();
    upCanvas.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const nx = upCanvas[Math.min(i + 1, upCanvas.length - 1)];
        if (i < upCanvas.length - 1)
          ctx.quadraticCurveTo(p.x, p.y, (p.x + nx.x) / 2, (p.y + nx.y) / 2);
        else ctx.lineTo(p.x, p.y);
      }
    });
    loCanvas.slice(1).forEach((p, i) => {
      const idx = i + 1;
      const nx  = loCanvas[Math.min(idx + 1, loCanvas.length - 1)];
      if (idx < loCanvas.length - 1)
        ctx.quadraticCurveTo(p.x, p.y, (p.x + nx.x) / 2, (p.y + nx.y) / 2);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(138, 32, 52, 0.60)";
    ctx.lineWidth   = Math.max(0.7, lipW * 0.013);
    ctx.lineJoin    = "round";
    ctx.lineCap     = "round";
    ctx.stroke();
    ctx.restore();
  }

  // ── Layer 4: Gloss (screen blend) via Three.js ────────────────────────────
  {
    // Shine gradient texture: bright at UV.y=1 (top of lips in Y-up)
    // CanvasTexture flipY=true: canvas Y=0 → UV.y=1 (top) → bright shine there
    const shineCanvas = document.createElement("canvas");
    shineCanvas.width  = 1;
    shineCanvas.height = 64;
    const sc   = shineCanvas.getContext("2d")!;
    const grad = sc.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0,   "rgba(255,255,255,0.30)"); // canvas top → lip top → bright
    grad.addColorStop(0.45,"rgba(255,255,255,0.14)");
    grad.addColorStop(1,   "rgba(255,255,255,0.0)");  // canvas bottom → lip bottom → none
    sc.fillStyle = grad;
    sc.fillRect(0, 0, 1, 64);

    const shineTex = new THREE.CanvasTexture(shineCanvas);
    shineTex.wrapS = THREE.ClampToEdgeWrapping;
    shineTex.wrapT = THREE.ClampToEdgeWrapping;

    const scene = new THREE.Scene();
    const geo   = new THREE.ShapeGeometry(lipShape);
    const mat   = new THREE.MeshBasicMaterial({
      map: shineTex,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(geo, mat));

    renderer.clear();
    renderer.render(scene, camera);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(renderer.domElement, 0, 0);
    ctx.restore();

    mat.dispose();
    geo.dispose();
    shineTex.dispose();
  }
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
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = getRenderer();
  } catch {
    // WebGL unavailable — silently skip 3D overlay
    return;
  }

  const camera = makeCamera(w, h);

  // Brows: seed 1 for left, seed 1000 for right (different hair patterns)
  drawBrow3d(ctx, lm, L_BROW_L, L_BROW_U, brow.shape, w, h, 1,    renderer, camera);
  drawBrow3d(ctx, lm, R_BROW_L, R_BROW_U, brow.shape, w, h, 1000, renderer, camera);

  // Eyeliner: Canvas 2D (thin lines gain nothing from 3D)
  drawEyeliner(ctx, lm, L_EYE_TOP, L_EYE_BOT, eyeliner.style, w, h);
  drawEyeliner(ctx, lm, R_EYE_TOP, R_EYE_BOT, eyeliner.style, w, h);

  // Lips: 3D extruded for volume
  drawLips3d(ctx, lm, lip.style, w, h, renderer, camera);
}
