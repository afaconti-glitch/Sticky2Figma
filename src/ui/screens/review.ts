import type { DetectedSticky } from '../types';
import { FIGJAM_COLORS } from '../detection/color';

export interface ReviewCallbacks {
  stickies: DetectedSticky[];
  onCreateStickies: (stickies: DetectedSticky[]) => void;
  onBack: () => void;
}

export function renderReview(container: HTMLElement, callbacks: ReviewCallbacks) {
  let stickies = [...callbacks.stickies];

  function render() {
    if (stickies.length === 0) {
      container.innerHTML = `
        <div class="no-stickies">
          <p>No sticky notes to add.</p>
          <button class="btn btn-primary" id="back-btn">Try Again</button>
        </div>
      `;
      container.querySelector('#back-btn')!.addEventListener('click', callbacks.onBack);
      return;
    }

    container.innerHTML = `
      <div class="review">
        <div class="review-header">
          <h2>${stickies.length} sticky note${stickies.length !== 1 ? 's' : ''} found</h2>
        </div>
        <div class="sticky-grid" id="sticky-grid"></div>
        <div class="review-actions">
          <button class="btn btn-secondary" id="back-btn">Back</button>
          <button class="btn btn-primary" id="add-btn">Add to FigJam</button>
        </div>
      </div>
    `;

    const grid = container.querySelector('#sticky-grid')!;

    stickies.forEach((sticky, index) => {
      const card = document.createElement('div');
      card.className = 'sticky-card';

      const rgb = sticky.color;
      const cssColor = `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`;

      card.innerHTML = `
        <div class="sticky-color-swatch" style="background: ${cssColor};" data-index="${index}" title="Click to change color"></div>
        <div class="sticky-card-content">
          <textarea rows="2" data-index="${index}">${escapeHtml(sticky.text)}</textarea>
          <span class="confidence-badge">${Math.round(sticky.confidence * 100)}% confidence</span>
        </div>
        <div class="sticky-card-actions">
          <button class="btn btn-danger" data-delete="${index}" title="Remove">&#10005;</button>
        </div>
      `;

      grid.appendChild(card);
    });

    // Text editing
    grid.querySelectorAll('textarea').forEach((textarea) => {
      textarea.addEventListener('input', (e) => {
        const el = e.target as HTMLTextAreaElement;
        const idx = parseInt(el.dataset.index!, 10);
        stickies[idx].text = el.value;
      });
    });

    // Delete buttons
    grid.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.delete!, 10);
        stickies.splice(idx, 1);
        render();
      });
    });

    // Color swatches - click to open picker
    grid.querySelectorAll('.sticky-color-swatch').forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10);
        showColorPicker(e.currentTarget as HTMLElement, idx);
      });
    });

    container.querySelector('#back-btn')!.addEventListener('click', callbacks.onBack);
    container.querySelector('#add-btn')!.addEventListener('click', () => {
      callbacks.onCreateStickies(stickies);
    });
  }

  function showColorPicker(anchor: HTMLElement, stickyIndex: number) {
    // Remove any existing picker
    const existing = container.querySelector('.color-picker-dropdown');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'color-picker-dropdown';

    const rect = anchor.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.bottom + 4}px`;

    FIGJAM_COLORS.forEach((color) => {
      const option = document.createElement('div');
      option.className = 'color-picker-option';
      option.style.background = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
      option.title = color.name;

      option.addEventListener('click', () => {
        stickies[stickyIndex].color = { r: color.r, g: color.g, b: color.b };
        picker.remove();
        render();
      });

      picker.appendChild(option);
    });

    document.body.appendChild(picker);

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  render();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
