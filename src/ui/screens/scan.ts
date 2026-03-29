import QRCode from 'qrcode';

export interface ScanSession {
  sessionId: string;
  uploadUrl: string;
  seenCount: number;
}

export interface ScanCallbacks {
  relayUrl: string;
  existingSession: ScanSession | null;
  onSessionReady: (session: ScanSession) => void;
  onSessionExpired: () => void;
  onImageReceived: (dataUrl: string) => void;
  onError: (message: string) => void;
}

export function renderScan(container: HTMLElement, callbacks: ScanCallbacks): () => void {
  let active = true;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let pollCount = 0;

  const base = callbacks.relayUrl.replace(/\/$/, '');

  container.innerHTML = `
    <div class="scan-panel">
      <div class="spinner" id="scan-spinner"></div>
      <p id="scan-status">Connecting to relay server...</p>
      <canvas id="qr-canvas" style="display:none; border-radius:8px; border:1px solid #e0e0e0;"></canvas>
      <p id="scan-url" style="font-size:10px; color:#bbb; word-break:break-all; display:none;"></p>
      <p id="scan-counter" style="display:none; font-size:13px; font-weight:600; color:#22c55e;"></p>
      <p id="scan-debug" style="font-size:10px; color:#bbb; margin-top:4px;"></p>
      <button id="new-qr" style="display:none; margin-top:4px; font-size:11px; background:none; border:none; color:#bbb; cursor:pointer; text-decoration:underline;">New QR Code</button>
    </div>
  `;

  const spinnerEl = container.querySelector('#scan-spinner') as HTMLElement;
  const statusEl = container.querySelector('#scan-status') as HTMLElement;
  const canvasEl = container.querySelector('#qr-canvas') as HTMLCanvasElement;
  const urlEl = container.querySelector('#scan-url') as HTMLElement;
  const counterEl = container.querySelector('#scan-counter') as HTMLElement;
  const debugEl = container.querySelector('#scan-debug') as HTMLElement;
  const newQrBtn = container.querySelector('#new-qr') as HTMLElement;
  let photoCount = 0;
  let currentSession: ScanSession | null = null;

  function setError(msg: string) {
    spinnerEl.style.display = 'none';
    statusEl.textContent = msg;
    statusEl.style.color = '#f24822';
    callbacks.onError(msg);
  }

  async function showQr(session: ScanSession) {
    currentSession = session;
    await QRCode.toCanvas(canvasEl, session.uploadUrl, { width: 200, margin: 2 });
    spinnerEl.style.display = 'none';
    canvasEl.style.display = 'block';
    statusEl.textContent = 'Scan with your phone:';
    statusEl.style.color = '';
    urlEl.textContent = session.uploadUrl;
    urlEl.style.display = 'block';
    newQrBtn.style.display = 'block';

    const resuming = session.seenCount > 0;
    counterEl.textContent = resuming
      ? `Session active — ${session.seenCount} photo${session.seenCount !== 1 ? 's' : ''} already sent`
      : 'Waiting for photos...';
    counterEl.style.display = 'block';

    startPolling(session);
    callbacks.onSessionReady(session);
  }

  function startPolling(session: ScanSession) {
    if (pollInterval) clearInterval(pollInterval);
    let seenCount = session.seenCount;
    const pollUrl = `${base}/poll/${session.sessionId}`;

    pollInterval = setInterval(async () => {
      if (!active) return;
      pollCount++;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const pollRes = await fetch(`${pollUrl}?since=${seenCount}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (!pollRes.ok) {
          debugEl.textContent = `Poll #${pollCount} — HTTP ${pollRes.status}`;
          if (pollRes.status === 410) {
            clearInterval(pollInterval!);
            pollInterval = null;
            callbacks.onSessionExpired();
            setError('Session expired. Tap "New QR Code" to start again.');
          }
          return;
        }

        const { images, total } = await pollRes.json() as { images: string[]; total: number };
        debugEl.textContent = `Poll #${pollCount} — server has ${total} image(s)`;

        for (const dataUrl of images) {
          photoCount++;
          counterEl.textContent = `${photoCount} photo${photoCount !== 1 ? 's' : ''} received`;
          callbacks.onImageReceived(dataUrl);
        }

        seenCount = total;
        // Keep session state up to date so it can be resumed
        if (currentSession) {
          currentSession.seenCount = seenCount;
          callbacks.onSessionReady(currentSession);
        }
      } catch (err) {
        debugEl.textContent = `Poll #${pollCount} failed: ${err instanceof Error ? err.message : err}`;
      }
    }, 2000);
  }

  async function createNewSession() {
    // Delete old session if any
    if (currentSession) {
      fetch(`${base}/session/${currentSession.sessionId}`, { method: 'DELETE' }).catch(() => {});
      currentSession = null;
    }
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }

    spinnerEl.style.display = 'block';
    canvasEl.style.display = 'none';
    newQrBtn.style.display = 'none';
    statusEl.textContent = 'Creating new session...';
    statusEl.style.color = '';
    photoCount = 0;

    callbacks.onSessionExpired(); // clear stored session in parent

    try {
      const res = await fetch(`${base}/create-session`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json() as { sessionId: string; uploadUrl: string };
      if (!active) return;
      await showQr({ sessionId: data.sessionId, uploadUrl: data.uploadUrl, seenCount: 0 });
    } catch (err) {
      if (!active) return;
      setError(`Could not reach relay server: ${err instanceof Error ? err.message : err}`);
    }
  }

  newQrBtn.addEventListener('click', createNewSession);

  async function init() {
    if (!base) {
      setError('No relay server URL. Add one in Settings.');
      return;
    }

    // Reuse existing session if available
    if (callbacks.existingSession) {
      try {
        await showQr(callbacks.existingSession);
        return;
      } catch {
        // Fall through to create a new session
      }
    }

    try {
      const res = await fetch(`${base}/create-session`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json() as { sessionId: string; uploadUrl: string };
      if (!active) return;
      await showQr({ sessionId: data.sessionId, uploadUrl: data.uploadUrl, seenCount: 0 });
    } catch (err) {
      if (!active) return;
      setError(`Could not reach relay server: ${err instanceof Error ? err.message : err}`);
    }
  }

  init();

  // Cleanup: stop polling but keep the session alive on the server
  return () => {
    active = false;
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  };
}
