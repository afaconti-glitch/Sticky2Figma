import type { DetectedSticky } from '../types';
import type { AIProvider } from './settings';
import { processImage } from '../detection/pipeline';

export interface ProcessingCallbacks {
  imageDataUrls: string[];
  apiKey: string;
  provider: AIProvider;
  onComplete: (stickies: DetectedSticky[]) => void;
  onError: (error: string) => void;
}

export function renderProcessing(container: HTMLElement, callbacks: ProcessingCallbacks) {
  const total = callbacks.imageDataUrls.length;

  container.innerHTML = `
    <div class="processing">
      <div class="spinner"></div>
      <h2>Processing Image${total > 1 ? 's' : ''}</h2>
      <p class="processing-status" id="status">Loading image${total > 1 ? ' 1 of ' + total : ''}...</p>
    </div>
  `;

  const statusEl = container.querySelector('#status')!;

  async function run() {
    const allStickies: DetectedSticky[] = [];

    for (let i = 0; i < total; i++) {
      const prefix = total > 1 ? `[Image ${i + 1}/${total}] ` : '';

      const stickies = await processImage(
        callbacks.imageDataUrls[i],
        (s) => { statusEl.textContent = prefix + s; },
        callbacks.apiKey,
        callbacks.provider,
      );

      allStickies.push(...stickies);
    }

    return allStickies;
  }

  run()
    .then((stickies) => {
      if (stickies.length === 0) {
        statusEl.textContent = 'No sticky notes detected. Returning...';
        setTimeout(() => callbacks.onError('No sticky notes found'), 1500);
      } else {
        callbacks.onComplete(stickies);
      }
    })
    .catch((err) => {
      console.error('Processing error:', err);
      const msg = err instanceof Error ? err.message : 'Processing failed';
      statusEl.textContent = 'Error: ' + msg;
      setTimeout(() => callbacks.onError(msg), 2000);
    });
}
