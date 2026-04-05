import { renderScan } from './scan';
import type { ScanSession } from './scan';

export interface CaptureCallbacks {
  onImagesCaptured: (dataUrls: string[]) => void;
  onBack: () => void;
  relayUrl: string;
  scanSession: ScanSession | null;
  onScanSessionReady: (session: ScanSession) => void;
  onScanSessionExpired: () => void;
}

export function renderCapture(container: HTMLElement, callbacks: CaptureCallbacks) {
  const images: string[] = [];
  let scanCleanup: (() => void) | null = null;

  container.innerHTML = `
    <div class="capture-area">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
        <button class="btn btn-secondary" id="back-btn" style="padding: 4px 8px;">&#8592;</button>
        <h2 style="margin: 0;">Capture Sticky Notes</h2>
      </div>

      <div class="image-thumbs" id="thumbs"></div>
      <div class="capture-actions" id="actions" style="display: none;">
        <button class="btn btn-secondary" id="add-more">Add More</button>
        <button class="btn btn-secondary" id="clear-all">Clear All</button>
        <button class="btn btn-primary" id="process">Process (<span id="count">0</span>)</button>
      </div>

      <div class="capture-tabs">
        <button class="capture-tab active" id="tab-upload">Upload Files</button>
        <button class="capture-tab" id="tab-scan">Scan with Phone</button>
      </div>

      <div id="panel-upload">
        <div class="drop-zone" id="drop-zone">
          <div class="drop-zone-icon">&#128247;</div>
          <p style="margin: 0;"><strong>Take a photo</strong> or drop images here</p>
          <p style="margin: 0; font-size: 11px; color: #999;">You can select multiple images or paste from clipboard</p>
          <input type="file" accept="image/*" capture="environment" multiple id="file-input">
        </div>
      </div>

      <div id="panel-scan" style="display: none;"></div>
    </div>
  `;

  const dropZone = container.querySelector('#drop-zone') as HTMLElement;
  const fileInput = container.querySelector('#file-input') as HTMLInputElement;
  const thumbsEl = container.querySelector('#thumbs') as HTMLElement;
  const actions = container.querySelector('#actions') as HTMLElement;
  const countEl = container.querySelector('#count') as HTMLElement;
  const panelUpload = container.querySelector('#panel-upload') as HTMLElement;
  const panelScan = container.querySelector('#panel-scan') as HTMLElement;
  const tabUpload = container.querySelector('#tab-upload') as HTMLButtonElement;
  const tabScan = container.querySelector('#tab-scan') as HTMLButtonElement;

  function updateUI() {
    countEl.textContent = String(images.length);
    actions.style.display = images.length > 0 ? 'flex' : 'none';
    renderThumbs();
  }

  function renderThumbs() {
    thumbsEl.innerHTML = '';
    images.forEach((dataUrl, i) => {
      const thumb = document.createElement('div');
      thumb.className = 'image-thumb';
      thumb.innerHTML = `
        <img src="${dataUrl}" alt="Image ${i + 1}">
        <button class="thumb-remove" data-index="${i}">&times;</button>
      `;
      thumbsEl.appendChild(thumb);
    });
    thumbsEl.querySelectorAll('.thumb-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10);
        images.splice(idx, 1);
        updateUI();
      });
    });
  }

  function addFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        images.push(e.target.result as string);
        updateUI();
      }
    };
    reader.readAsDataURL(file);
  }

  function addFiles(files: FileList | File[]) {
    for (let i = 0; i < files.length; i++) addFile(files[i]);
  }

  function activateTab(tab: 'upload' | 'scan') {
    if (tab === 'upload') {
      panelUpload.style.display = '';
      panelScan.style.display = 'none';
      tabUpload.classList.add('active');
      tabScan.classList.remove('active');
      if (scanCleanup) { scanCleanup(); scanCleanup = null; }
    } else {
      panelUpload.style.display = 'none';
      panelScan.style.display = '';
      tabUpload.classList.remove('active');
      tabScan.classList.add('active');
      panelScan.innerHTML = '';
      scanCleanup = renderScan(panelScan, {
        relayUrl: callbacks.relayUrl,
        existingSession: callbacks.scanSession,
        onSessionReady: callbacks.onScanSessionReady,
        onSessionExpired: callbacks.onScanSessionExpired,
        onImageReceived: (dataUrl) => {
          images.push(dataUrl);
          updateUI();
        },
        onError: () => { /* graceful — upload tab still works */ },
      });
    }
  }

  tabUpload.addEventListener('click', () => activateTab('upload'));
  tabScan.addEventListener('click', () => activateTab('scan'));

  // File input
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files) addFiles(fileInput.files);
    fileInput.value = '';
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  });

  // Clipboard paste
  document.addEventListener('paste', (e) => {
    if (e.clipboardData?.files.length) addFiles(e.clipboardData.files);
  });

  // Actions
  container.querySelector('#add-more')!.addEventListener('click', () => {
    activateTab('upload');
    fileInput.click();
  });
  container.querySelector('#clear-all')!.addEventListener('click', () => {
    images.length = 0;
    updateUI();
  });
  container.querySelector('#process')!.addEventListener('click', () => {
    if (images.length > 0) callbacks.onImagesCaptured([...images]);
  });
  container.querySelector('#back-btn')!.addEventListener('click', () => {
    if (scanCleanup) { scanCleanup(); scanCleanup = null; }
    callbacks.onBack();
  });
}
