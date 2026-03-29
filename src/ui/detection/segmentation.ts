export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Detect sticky note regions in an image using HSV color thresholding
 * and connected component labeling via flood-fill.
 *
 * Returns bounding boxes of detected sticky note regions.
 */
export function segmentStickies(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): Region[] {
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const { data } = imageData;
  const totalPixels = width * height;

  // Step 1: Create binary mask based on HSV thresholds
  // Sticky notes are characterized by high saturation and medium-to-high brightness
  const mask = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx] / 255;
    const g = data[idx + 1] / 255;
    const b = data[idx + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const value = max;

    // Thresholds tuned for typical sticky note colors
    if (saturation > 0.2 && value > 0.35) {
      mask[i] = 1;
    }
  }

  // Step 2: Simple morphological cleanup
  // Remove isolated pixels (noise)
  const cleaned = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0) continue;

      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (mask[(y + dy) * width + (x + dx)] === 1) neighbors++;
        }
      }
      if (neighbors < 3) cleaned[idx] = 0;
    }
  }

  // Fill small holes
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (cleaned[idx] === 1) continue;

      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (cleaned[(y + dy) * width + (x + dx)] === 1) neighbors++;
        }
      }
      if (neighbors >= 5) cleaned[idx] = 1;
    }
  }

  // Step 3: Connected component labeling via flood-fill
  const labels = new Int32Array(totalPixels);
  let nextLabel = 1;
  const components: Map<number, { minX: number; minY: number; maxX: number; maxY: number; count: number }> = new Map();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (cleaned[idx] === 0 || labels[idx] !== 0) continue;

      // Flood fill from this pixel
      const label = nextLabel++;
      const component = { minX: x, minY: y, maxX: x, maxY: y, count: 0 };
      const stack: number[] = [idx];

      while (stack.length > 0) {
        const pos = stack.pop()!;
        if (labels[pos] !== 0 || cleaned[pos] === 0) continue;

        labels[pos] = label;
        component.count++;

        const px = pos % width;
        const py = Math.floor(pos / width);
        component.minX = Math.min(component.minX, px);
        component.minY = Math.min(component.minY, py);
        component.maxX = Math.max(component.maxX, px);
        component.maxY = Math.max(component.maxY, py);

        // 4-connectivity for speed
        if (px > 0) stack.push(pos - 1);
        if (px < width - 1) stack.push(pos + 1);
        if (py > 0) stack.push(pos - width);
        if (py < height - 1) stack.push(pos + width);
      }

      components.set(label, component);
    }
  }

  // Step 4: Filter components by size and aspect ratio
  const minArea = totalPixels * 0.01;  // At least 1% of image
  const maxArea = totalPixels * 0.6;   // At most 60% of image
  const regions: Region[] = [];

  for (const [, comp] of components) {
    if (comp.count < minArea || comp.count > maxArea) continue;

    const w = comp.maxX - comp.minX + 1;
    const h = comp.maxY - comp.minY + 1;
    const aspect = w / h;

    // Sticky notes are roughly square to moderately rectangular
    if (aspect < 0.2 || aspect > 5.0) continue;

    // Add some padding
    const pad = Math.round(Math.min(w, h) * 0.05);
    regions.push({
      x: Math.max(0, comp.minX - pad),
      y: Math.max(0, comp.minY - pad),
      w: Math.min(width - comp.minX + pad, w + pad * 2),
      h: Math.min(height - comp.minY + pad, h + pad * 2),
    });
  }

  // Sort by position: top-to-bottom, then left-to-right
  regions.sort((a, b) => {
    const rowDiff = Math.floor(a.y / 50) - Math.floor(b.y / 50);
    if (rowDiff !== 0) return rowDiff;
    return a.x - b.x;
  });

  return regions;
}
