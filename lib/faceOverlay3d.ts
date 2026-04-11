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

// Three.js is Y-up; canvas is Y-down. Flip Y when compositing.
const fy    = (p: Pt, h: number): Pt  => ({ x: p.x, y: h - p.y });
const fyAll = (ps: Pt[], h: number)   => ps.map((p) => fy(p, h));

// ── Deterministic pseudo-random ───────────────────────────────────────────────
function dr(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

// ── Canvas 2D smooth bezier helper ───────────────────────────────────────────
// Draws a quadratic bezier spline through `points` on a 2D canvas context.
function smoothC(ctx: CanvasRenderingContext2D, points: Pt[], move: boolean) {
  if (points.length < 2) return;
  if (move) ctx.moveTo(points[0].x, points[0].y);
  else       ctx.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

// ── Three.js Shape smooth bezier helper ──────────────────────────────────────
function smoothShape(
  target: THREE.Shape | THREE.Path,
  points: Pt[],
  move = true,
) {
  if (points.length < 2) return;
  if (move) target.moveTo(points[0].x, points[0].y);
  else       target.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    target.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  target.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

// ── Landmark index groups ─────────────────────────────────────────────────────
const L_BROW_L = [46, 53, 52, 65, 55];    // lower edge inner→outer
const L_BROW_U = [70, 63, 105, 66, 107];  // upper edge outer→inner

const R_BROW_L = [276, 283, 282, 295, 285];
const R_BROW_U = [300, 293, 334, 296, 336];

// Both eyes: inner→outer for TOP, outer→inner for BOT.
// Last element of TOP = outer/temporal corner → cat-eye wing goes outward.
const L_EYE_TOP = [133, 158, 160, 33];   // inner→outer  (33 = temporal outer)
const L_EYE_BOT = [33,  144, 153, 133];  // outer→inner
const R_EYE_TOP = [362, 385, 387, 263];  // inner→outer  (263 = temporal outer)
const R_EYE_BOT = [263, 373, 380, 362];  // outer→inner

const LIP_UP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const LIP_LO = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];

// ── Brow upper-edge modifier (Canvas 2D: Y-down, "up" = smaller Y) ───────────
// upper[] goes outer→inner; t=0 is outer corner, t=1 is inner.
function modBrowUpper(
  upper: Pt[],
  shape:  BrowRecommendation["shape"],
  browH:  number,  // > 0 when lower.y > upper.y (lower below upper on screen)
): Pt[] {
  const n    = upper.length;
  const lift = Math.abs(browH);
  return upper.map((p, i) => {
    const t    = i / (n - 1);
    const arch = Math.sin(t * Math.PI);
    switch (shape) {
      case "yuksek_kavis": return { x: p.x, y: p.y - lift * 0.85 * arch };
      case "duz": {
        const avg = upper.reduce((s, q) => s + q.y, 0) / n;
        return { x: p.x, y: p.y * 0.25 + avg * 0.75 };
      }
      case "ince":    return { x: p.x, y: p.y + lift * 0.40 };          // lower = thinner
      case "kavisli": return { x: p.x, y: p.y - lift * 0.45 * arch };
      case "kalkik":  return { x: p.x, y: p.y - lift * 0.55 * (1 - t) };// raise outer end
      default:        return p;
    }
  });
}

// ── Eyebrow renderer — pure Canvas 2D ─────────────────────────────────────────
// Draws a soft blurred base + clipped hair strokes.
// No Three.js needed — avoids heavy multiply layering that looked blocky.
function drawBrow(
  ctx:        CanvasRenderingContext2D,
  lm:         LM[],
  lowerIdxs:  number[],
  upperIdxs:  number[],
  shape:      BrowRecommendation["shape"],
  w:          number,
  h:          number,
  seed:       number,
) {
  const lower = pts(lm, lowerIdxs, w, h);  // inner→outer
  const upper = pts(lm, upperIdxs, w, h);  // outer→inner

  const browH =
    lower.reduce((s, p) => s + p.y, 0) / lower.length -
    upper.reduce((s, p) => s + p.y, 0) / upper.length;

  const modUpper = modBrowUpper(upper, shape, browH);

  // Reusable: build closed brow outline on the current path
  const buildPath = () => {
    ctx.beginPath();
    smoothC(ctx, lower,    true);   // lower inner→outer
    smoothC(ctx, modUpper, false);  // upper outer→inner
    ctx.closePath();
  };

  // ── Layer 1: soft blurred fill ─────────────────────────────────────────────
  ctx.save();
  ctx.filter = "blur(2px)";
  ctx.globalCompositeOperation = "multiply";
  buildPath();
  ctx.fillStyle = "rgba(48, 26, 7, 0.20)";
  ctx.fill();
  ctx.restore();

  // ── Layer 2: hair strokes clipped inside brow shape ────────────────────────
  const allPts = [...lower, ...modUpper];
  const minX   = Math.min(...allPts.map((p) => p.x));
  const maxX   = Math.max(...allPts.map((p) => p.x));
  const minY   = Math.min(...allPts.map((p) => p.y)); // brow top
  const maxY   = Math.max(...allPts.map((p) => p.y)); // brow bottom
  const bw     = Math.max(1, maxX - minX);
  const bh     = Math.max(1, maxY - minY);

  ctx.save();
  buildPath();
  ctx.clip();  // restrict strokes to brow area

  const N = 100;
  for (let i = 0; i < N; i++) {
    const tx     = minX + (dr(seed + i * 2) * 1.08 - 0.04) * bw;
    const startY = maxY - dr(seed + i * 7)  * bh * 0.15;  // near brow bottom
    const endY   = minY + dr(seed + i * 11) * bh * 0.28;  // near brow top
    const cpX    = tx   + (dr(seed + i * 17) - 0.5) * bw * 0.05;
    const cpY    = startY * 0.38 + endY * 0.62;
    const alpha  = 0.28  + dr(seed + i * 19) * 0.40;
    const lw     = 0.5   + dr(seed + i * 23) * 1.4;

    ctx.strokeStyle = `rgba(28, 14, 4, ${alpha.toFixed(2)})`;
    ctx.lineWidth   = lw;
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(tx, startY);
    ctx.quadraticCurveTo(
      cpX, cpY,
      tx + (dr(seed + i * 29) - 0.5) * bw * 0.04,
      endY,
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ── Eyeliner — smooth filled shape (no segment joints = no sharp corners) ─────
// Constructs the liner as a filled polygon:
//   forward along linerEdge (top shifted upward, tapered inner→outer),
//   backward along the eyelid landmarks (outer→inner).
function drawEyeliner(
  ctx:      CanvasRenderingContext2D,
  lm:       LM[],
  topIdxs:  number[],
  botIdxs:  number[],
  style:    EyelinerRecommendation["style"],
  w:        number,
  h:        number,
) {
  const top  = pts(lm, topIdxs, w, h);  // inner→outer
  const bot  = pts(lm, botIdxs, w, h);  // outer→inner
  const eyeW = Math.abs(top[top.length - 1].x - top[0].x);

  const maxLW =
    style === "dramatik"                          ? eyeW * 0.080
    : style === "klasik" || style === "cat_eye"  ? eyeW * 0.054
    :                                               eyeW * 0.036;

  // Build the outer (upper) edge of the liner strip
  const n          = top.length;
  const linerEdge: Pt[] = top.map((p, i) => {
    const t         = i / (n - 1);
    const thickness = maxLW * (0.08 + 0.92 * t); // thin at inner, thick at outer
    return { x: p.x, y: p.y - thickness };        // canvas Y-down: -y = upward
  });

  ctx.save();
  ctx.fillStyle   = "rgba(6, 4, 14, 0.88)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.28)";
  ctx.shadowBlur  = 1.5;

  // Filled strip: linerEdge inner→outer, then lid reversed outer→inner
  ctx.beginPath();
  smoothC(ctx, linerEdge,         true);
  smoothC(ctx, [...top].reverse(), false);
  ctx.closePath();
  ctx.fill();

  // Cat-eye wing (extends from outer corner outward + upward)
  if (style === "cat_eye") {
    const outer   = top[top.length - 1];
    const prev    = top[top.length - 2];
    const angle   = Math.atan2(outer.y - prev.y, outer.x - prev.x) - Math.PI / 5.5;
    const wingLen = eyeW * 0.22;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.lineTo(
      outer.x + Math.cos(angle) * wingLen,
      outer.y + Math.sin(angle) * wingLen,
    );
    ctx.lineWidth   = maxLW * 0.45;
    ctx.strokeStyle = "rgba(6, 4, 14, 0.88)";
    ctx.lineCap     = "round";
    ctx.stroke();
  }

  // Lower lid liner for alt_hat — drawn below the eyelid (+y direction)
  if (style === "alt_hat") {
    const m       = bot.length;
    const botEdge: Pt[] = bot.map((p, i) => {
      const t         = i / (m - 1);              // t=0: outer, t=1: inner
      const thickness = maxLW * 0.38 * (0.20 + 0.80 * (1 - t)); // thicker at outer
      return { x: p.x, y: p.y + thickness };      // +y = below eyelid
    });

    ctx.beginPath();
    smoothC(ctx, botEdge,          true);
    smoothC(ctx, [...bot].reverse(), false);
    ctx.closePath();
    ctx.fillStyle = "rgba(6, 4, 14, 0.68)";
    ctx.fill();
  }

  ctx.restore();
}

// ── Three.js renderer singleton ───────────────────────────────────────────────
let _renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({
      alpha:                true,
      antialias:            true,
      preserveDrawingBuffer: true,
    });
    _renderer.setClearColor(0x000000, 0);
  }
  return _renderer;
}

// Orthographic camera mapping pixel coords 1:1.
// Camera at origin: world_x → NDC_x = 2*x/w − 1  ✓
function makeCamera(w: number, h: number): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(0, w, h, 0, -200, 200);
  // Must be at (0,0,z), NOT at (w/2, h/2, z).
  // Placing at (w/2,h/2,z) would shift all rendered content by (w/2, h/2).
  cam.position.set(0, 0, 100);
  return cam;
}

// ── Lip shape modifiers (Three.js Y-up: up = +Y) ─────────────────────────────
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

// ── Lip renderer — Three.js ExtrudeGeometry for 3-D volume ───────────────────
function drawLips3d(
  ctx:      CanvasRenderingContext2D,
  lm:       LM[],
  style:    LipRecommendation["style"],
  w:        number,
  h:        number,
  renderer: THREE.WebGLRenderer,
  camera:   THREE.OrthographicCamera,
) {
  const upperRaw = pts(lm, LIP_UP, w, h);
  const lowerRaw = pts(lm, LIP_LO, w, h);
  const lipW     = Math.abs(upperRaw[upperRaw.length - 1].x - upperRaw[0].x);

  const upper = fyAll(upperRaw, h);
  const lower = fyAll(lowerRaw, h);
  const modUp = modLipUpper(upper, style, lipW);
  const modLo = modLipLower(lower, style, lipW);

  const lipShape = new THREE.Shape();
  smoothShape(lipShape, modUp, true);
  smoothShape(lipShape, modLo, false);
  lipShape.closePath();

  renderer.setSize(w, h);

  // ── Layer 1: 3-D extruded base (multiply blend) ───────────────────────────
  {
    const depth  = clamp(lipW * 0.07, 4, 20);
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled:   true,
      bevelSegments:  4,
      bevelSize:      clamp(lipW * 0.028, 1.5, 8),
      bevelThickness: clamp(lipW * 0.035, 2,   10),
      bevelOffset:    0,
    };

    const scene   = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.60));
    const front = new THREE.DirectionalLight(0xffffff, 1.0);
    front.position.set(w * 0.5, h * 1.3, 180);
    scene.add(front);
    const fill = new THREE.DirectionalLight(0xfffaf8, 0.30);
    fill.position.set(w * 0.5, -h * 0.3, 100);
    scene.add(fill);

    const geo = new THREE.ExtrudeGeometry(lipShape, extrudeSettings);
    const mat = new THREE.MeshPhongMaterial({
      color:       new THREE.Color(0.882, 0.345, 0.424),
      specular:    new THREE.Color(1.0, 0.85, 0.85),
      shininess:   90,
      transparent: true,
      opacity:     0.78,
      depthWrite:  false,
      side:        THREE.FrontSide,
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

  // ── Layer 2: gradient fill (normal blend) — in canvas coords ─────────────
  {
    const upC = modUp.map((p) => fy(p, h));
    const loC = modLo.map((p) => fy(p, h));

    const allC  = [...upC, ...loC];
    const minX  = Math.min(...allC.map((p) => p.x));
    const maxX  = Math.max(...allC.map((p) => p.x));
    const minY  = Math.min(...allC.map((p) => p.y));
    const maxY  = Math.max(...allC.map((p) => p.y));
    const cx    = (minX + maxX) / 2;

    const grad = ctx.createLinearGradient(cx, minY, cx, maxY);
    grad.addColorStop(0,    "rgba(240, 100, 120, 0.26)");
    grad.addColorStop(0.40, "rgba(210,  70,  90, 0.13)");
    grad.addColorStop(1,    "rgba(160,  40,  58, 0.28)");

    ctx.save();
    ctx.beginPath();
    smoothC(ctx, upC, true);
    smoothC(ctx, loC, false);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // ── Layer 3: lip liner stroke ─────────────────────────────────────────────
  {
    const upC = modUp.map((p) => fy(p, h));
    const loC = modLo.map((p) => fy(p, h));

    ctx.save();
    ctx.beginPath();
    smoothC(ctx, upC, true);
    smoothC(ctx, loC, false);
    ctx.closePath();
    ctx.strokeStyle = "rgba(138, 32, 52, 0.55)";
    ctx.lineWidth   = Math.max(0.7, lipW * 0.013);
    ctx.lineJoin    = "round";
    ctx.lineCap     = "round";
    ctx.stroke();
    ctx.restore();
  }

  // ── Layer 4: gloss highlight (screen blend) ───────────────────────────────
  {
    const shineC = document.createElement("canvas");
    shineC.width = 1; shineC.height = 64;
    const sc   = shineC.getContext("2d")!;
    const grad = sc.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0,    "rgba(255,255,255,0.28)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.12)");
    grad.addColorStop(1,    "rgba(255,255,255,0.00)");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, 1, 64);

    const shineTex     = new THREE.CanvasTexture(shineC);
    shineTex.wrapS     = THREE.ClampToEdgeWrapping;
    shineTex.wrapT     = THREE.ClampToEdgeWrapping;

    const scene = new THREE.Scene();
    const geo   = new THREE.ShapeGeometry(lipShape);
    const mat   = new THREE.MeshBasicMaterial({
      map:         shineTex,
      transparent: true,
      opacity:     1.0,
      depthWrite:  false,
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
  ctx:      CanvasRenderingContext2D,
  lm:       LM[],
  brow:     BrowRecommendation,
  eyeliner: EyelinerRecommendation,
  lip:      LipRecommendation,
  w:        number,
  h:        number,
) {
  // Brows: pure Canvas 2D (seed 1 = left pattern, seed 1000 = right)
  drawBrow(ctx, lm, L_BROW_L, L_BROW_U, brow.shape, w, h, 1);
  drawBrow(ctx, lm, R_BROW_L, R_BROW_U, brow.shape, w, h, 1000);

  // Eyeliner: filled smooth shape
  drawEyeliner(ctx, lm, L_EYE_TOP, L_EYE_BOT, eyeliner.style, w, h);
  drawEyeliner(ctx, lm, R_EYE_TOP, R_EYE_BOT, eyeliner.style, w, h);

  // Lips: Three.js 3-D extrude (only place WebGL is needed)
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = getRenderer();
  } catch {
    return;
  }
  drawLips3d(ctx, lm, lip.style, w, h, renderer, makeCamera(w, h));
}
