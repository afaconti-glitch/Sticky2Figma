export interface DetectedSticky {
  id: string;
  text: string;
  color: { r: number; g: number; b: number };
  originalColor: { r: number; g: number; b: number };
  boundingBox: { x: number; y: number; w: number; h: number };
  confidence: number;
  thumbnailDataUrl: string;
}

export type Screen = 'welcome' | 'settings' | 'capture' | 'processing' | 'review' | 'success';
