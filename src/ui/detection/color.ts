export interface FigJamColor {
  name: string;
  r: number;
  g: number;
  b: number;
}

// FigJam's default sticky note palette colors (normalized 0-1 RGB)
// These map to FigJam's actual sticky color options
export const FIGJAM_COLORS: FigJamColor[] = [
  { name: 'Yellow',  r: 0.976, g: 0.890, b: 0.200 },
  { name: 'Orange',  r: 1.0,   g: 0.722, b: 0.384 },
  { name: 'Pink',    r: 1.0,   g: 0.616, b: 0.659 },
  { name: 'Purple',  r: 0.796, g: 0.612, b: 1.0   },
  { name: 'Blue',    r: 0.502, g: 0.769, b: 1.0   },
  { name: 'Green',   r: 0.502, g: 0.937, b: 0.604 },
  { name: 'Gray',    r: 0.898, g: 0.898, b: 0.898 },
];

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return { h, s, l };
}

/**
 * Compute the dominant color of a region by sampling the center portion
 * (avoids edges/shadows) and using the median of HSL values.
 */
export function detectDominantColor(
  imageData: ImageData,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number,
): { r: number; g: number; b: number } {
  const { data, width } = imageData;

  // Sample the center 60% of the region to avoid edges and shadows
  const insetX = Math.round(regionW * 0.2);
  const insetY = Math.round(regionH * 0.2);
  const sampleX = regionX + insetX;
  const sampleY = regionY + insetY;
  const sampleW = regionW - insetX * 2;
  const sampleH = regionH - insetY * 2;

  const rValues: number[] = [];
  const gValues: number[] = [];
  const bValues: number[] = [];

  // Sample every few pixels for speed
  const step = Math.max(1, Math.floor(Math.min(sampleW, sampleH) / 30));

  for (let y = sampleY; y < sampleY + sampleH; y += step) {
    for (let x = sampleX; x < sampleX + sampleW; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;

      // Skip very dark pixels (shadows, ink)
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness < 0.25) continue;

      rValues.push(r);
      gValues.push(g);
      bValues.push(b);
    }
  }

  if (rValues.length === 0) {
    return { r: 0.9, g: 0.9, b: 0.9 }; // fallback gray
  }

  // Use median for robustness against outliers
  rValues.sort((a, b) => a - b);
  gValues.sort((a, b) => a - b);
  bValues.sort((a, b) => a - b);

  const mid = Math.floor(rValues.length / 2);
  return {
    r: rValues[mid],
    g: gValues[mid],
    b: bValues[mid],
  };
}

/**
 * Map an RGB color to the nearest FigJam sticky palette color.
 * Uses weighted HSL distance for perceptually accurate matching.
 */
export function mapToFigJamColor(color: { r: number; g: number; b: number }): FigJamColor {
  const inputHsl = rgbToHsl(color.r, color.g, color.b);

  let bestMatch = FIGJAM_COLORS[0];
  let bestDist = Infinity;

  for (const fjColor of FIGJAM_COLORS) {
    const targetHsl = rgbToHsl(fjColor.r, fjColor.g, fjColor.b);

    // Hue distance (circular)
    let dh = Math.abs(inputHsl.h - targetHsl.h);
    if (dh > 0.5) dh = 1.0 - dh;

    const ds = inputHsl.s - targetHsl.s;
    const dl = inputHsl.l - targetHsl.l;

    // Weight hue most heavily, then saturation, then lightness
    const dist = dh * dh * 4 + ds * ds + dl * dl;

    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = fjColor;
    }
  }

  return bestMatch;
}
