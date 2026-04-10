export interface ColorProfile {
  skinTone: "açık" | "orta" | "koyu";
  skinUndertone: "soğuk" | "nötr" | "sıcak";
  eyeColor: "açık" | "ela" | "koyu";
  hairDarkness: "açık" | "orta" | "koyu";
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function sampleRegion(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number
): RGB {
  const { data, width, height } = imageData;
  let r = 0, g = 0, b = 0, count = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = Math.round(cx + dx);
      const py = Math.round(cy + dy);
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const idx = (py * width + px) * 4;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
      count++;
    }
  }

  if (count === 0) return { r: 128, g: 100, b: 80 };
  return { r: r / count, g: g / count, b: b / count };
}

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s, l };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

type Landmark = { x: number; y: number; z: number };

export function analyzeColors(
  imageData: ImageData,
  landmarks: Landmark[],
  canvasW: number,
  canvasH: number
): ColorProfile {
  const lm = (i: number) => ({
    x: landmarks[i].x * canvasW,
    y: landmarks[i].y * canvasH,
  });

  // --- Cilt tonu: 3 bölgeden örnekle, medyan L değeri kullan ---
  // Sol yanak (205), Sağ yanak (425), Burun üstü (6)
  const skinRegions = [lm(205), lm(425), lm(6)];
  const skinSamples = skinRegions.map((p) => sampleRegion(imageData, p.x, p.y, 10));
  const skinHslValues = skinSamples.map(rgbToHsl);

  const skinL = median(skinHslValues.map((h) => h.l));
  // Undertone için RGB bileşenlerinin medyanı
  const skinR = median(skinSamples.map((s) => s.r));
  const skinB = median(skinSamples.map((s) => s.b));

  // --- Göz rengi: iris merkezi ---
  // Landmark 468 = sol iris merkezi, 473 = sağ iris merkezi (478-nokta modelinde mevcut)
  // Eğer model 468+ nokta döndürmediyse üst göz kapağına (159/386) geri dön
  const hasIris = landmarks.length > 473;
  const leftIris = hasIris ? lm(468) : { x: lm(159).x, y: lm(159).y + 6 };
  const rightIris = hasIris ? lm(473) : { x: lm(386).x, y: lm(386).y + 6 };

  const leftEyeSample = sampleRegion(imageData, leftIris.x, leftIris.y, 4);
  const rightEyeSample = sampleRegion(imageData, rightIris.x, rightIris.y, 4);
  const eyeHsl = rgbToHsl({
    r: (leftEyeSample.r + rightEyeSample.r) / 2,
    g: (leftEyeSample.g + rightEyeSample.g) / 2,
    b: (leftEyeSample.b + rightEyeSample.b) / 2,
  });

  // --- Saç koyuluğu: alın üstü (landmark 10'dan yukarı) ---
  const forehead = lm(10);
  const hairSample = sampleRegion(imageData, forehead.x, forehead.y - 20, 10);
  const hairHsl = rgbToHsl(hairSample);

  // --- Sınıflandırma ---

  let skinTone: ColorProfile["skinTone"];
  if (skinL > 0.65) skinTone = "açık";
  else if (skinL > 0.40) skinTone = "orta";
  else skinTone = "koyu";

  let skinUndertone: ColorProfile["skinUndertone"];
  const rbDiff = skinR - skinB;
  if (rbDiff > 30) skinUndertone = "sıcak";
  else if (rbDiff < 10) skinUndertone = "soğuk";
  else skinUndertone = "nötr";

  let eyeColor: ColorProfile["eyeColor"];
  if (eyeHsl.l > 0.50) eyeColor = "açık";
  else if (eyeHsl.s > 0.15) eyeColor = "ela";
  else eyeColor = "koyu";

  let hairDarkness: ColorProfile["hairDarkness"];
  if (hairHsl.l > 0.55) hairDarkness = "açık";
  else if (hairHsl.l > 0.30) hairDarkness = "orta";
  else hairDarkness = "koyu";

  return { skinTone, skinUndertone, eyeColor, hairDarkness };
}

export function getColorAdvice(profile: ColorProfile): string {
  const tips: string[] = [];

  if (profile.skinUndertone === "sıcak") {
    tips.push("Sıcak ton cildinize uygun: kahverengi, bronz ve terrakota tonları önerilir.");
  } else if (profile.skinUndertone === "soğuk") {
    tips.push("Soğuk ton cildinize uygun: grimsü, kül ve bej tonlar tercih edin.");
  } else {
    tips.push("Nötr ton cildiniz her renk paletine uygundur.");
  }

  if (profile.eyeColor === "açık") {
    tips.push("Açık göz renginizi kontrastlı koyu eyeliner ile vurgulayabilirsiniz.");
  } else if (profile.eyeColor === "ela") {
    tips.push("Ela göz renginiz için yeşil veya mor tonlar derinlik katar.");
  }

  if (profile.hairDarkness === "koyu" && profile.skinTone === "açık") {
    tips.push("Koyu saç — açık cilt kontrastı: kaş pigmentini koyu tutun.");
  }

  return tips.join(" ");
}
