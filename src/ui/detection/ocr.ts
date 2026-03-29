// Tesseract.js is loaded via CDN in the HTML template
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Tesseract: any;

/**
 * Initialize a Tesseract.js worker for English text recognition,
 * configured for handwriting on sticky notes.
 */
export async function createOCRWorker(): Promise<{
  recognize: (canvas: HTMLCanvasElement) => Promise<{ text: string; confidence: number }>;
  terminate: () => Promise<void>;
}> {
  // OEM 2 = Legacy + LSTM combined (best for handwriting)
  const worker = await Tesseract.createWorker('eng', 2);

  // PSM 6 = single uniform block of text (good for individual sticky notes)
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
  });

  return {
    async recognize(canvas: HTMLCanvasElement) {
      const result = await worker.recognize(canvas);
      return {
        text: result.data.text,
        confidence: result.data.confidence / 100,
      };
    },
    async terminate() {
      await worker.terminate();
    },
  };
}

/**
 * Pre-process a cropped sticky note image for better OCR results.
 * Uses adaptive binarization to separate ink from the colored sticky background.
 */
export function preprocessForOCR(canvas: HTMLCanvasElement): HTMLCanvasElement {
  // Step 1: Upscale small crops (Tesseract works best at 300+ DPI equivalent)
  const minDim = 300;
  let { width, height } = canvas;
  const scale = Math.max(1, minDim / Math.min(width, height));

  const scaled = document.createElement('canvas');
  scaled.width = Math.round(width * scale);
  scaled.height = Math.round(height * scale);
  const sCtx = scaled.getContext('2d')!;
  sCtx.drawImage(canvas, 0, 0, scaled.width, scaled.height);

  width = scaled.width;
  height = scaled.height;

  const ctx = sCtx;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;

  // Step 2: Convert to grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }

  // Step 3: Adaptive thresholding (local mean)
  // This is key for colored sticky notes — it adapts to the local background color
  // so dark ink on a yellow/pink/blue background all get properly binarized
  const blockSize = Math.max(15, Math.round(Math.min(width, height) / 8) | 1);
  const C = 12; // bias — higher = more sensitive to faint strokes

  // Compute integral image for fast local mean calculation
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        rowSum + integral[y * (width + 1) + (x + 1)];
    }
  }

  const half = Math.floor(blockSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Local window bounds
      const y1 = Math.max(0, y - half);
      const y2 = Math.min(height - 1, y + half);
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);

      const area = (y2 - y1 + 1) * (x2 - x1 + 1);
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];

      const localMean = sum / area;
      const px = gray[y * width + x];

      // Pixel is ink (black) if it's darker than the local mean minus bias
      const val = px < localMean - C ? 0 : 255;

      const idx = (y * width + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return scaled;
}

/**
 * Clean up OCR text output.
 */
export function cleanOCRText(text: string): string {
  return text
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '');
}
