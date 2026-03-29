import type { PluginToUIMessage } from '../plugin/messages';
import type { DetectedSticky, Screen } from './types';
import type { AIProvider } from './screens/settings';
import type { ScanSession } from './screens/scan';
import { renderWelcome } from './screens/welcome';
import { renderCapture } from './screens/capture';
import { renderProcessing } from './screens/processing';
import { renderReview } from './screens/review';
import { renderSettings } from './screens/settings';

const app = document.getElementById('app')!;
let currentScreen: Screen = 'welcome';
let capturedImageDataUrls: string[] = [];
let detectedStickies: DetectedSticky[] = [];
let aiProvider: AIProvider = 'anthropic';
let anthropicKey: string = '';
let openaiKey: string = '';
let relayUrl: string = '';
let scanSession: ScanSession | null = null;

function getActiveKey(): string {
  return aiProvider === 'openai' ? openaiKey : anthropicKey;
}

function navigate(screen: Screen, data?: unknown) {
  currentScreen = screen;
  app.innerHTML = '';

  switch (screen) {
    case 'welcome':
      renderWelcome(app, {
        onGetStarted: () => {
          if (!getActiveKey()) {
            navigate('settings');
          } else {
            navigate('capture');
          }
        },
        onSettings: () => navigate('settings'),
      });
      break;

    case 'settings':
      renderSettings(app, {
        currentProvider: aiProvider,
        currentKey: getActiveKey(),
        currentRelayUrl: relayUrl,
        onSave: (provider: AIProvider, key: string, newRelayUrl: string) => {
          aiProvider = provider;
          if (provider === 'anthropic') {
            anthropicKey = key;
          } else {
            openaiKey = key;
          }
          relayUrl = newRelayUrl;
          parent.postMessage({ pluginMessage: { type: 'save-api-key', provider, key } }, '*');
          parent.postMessage({ pluginMessage: { type: 'save-relay-url', url: newRelayUrl } }, '*');
          navigate('capture');
        },
        onBack: () => navigate('welcome'),
      });
      break;

    case 'capture':
      renderCapture(app, {
        onImagesCaptured: (dataUrls: string[]) => {
          capturedImageDataUrls = dataUrls;
          navigate('processing');
        },
        onBack: () => {
          scanSession = null;
          navigate('welcome');
        },
        relayUrl,
        scanSession,
        onScanSessionReady: (session) => { scanSession = session; },
        onScanSessionExpired: () => { scanSession = null; },
      });
      break;

    case 'processing':
      renderProcessing(app, {
        imageDataUrls: capturedImageDataUrls,
        apiKey: getActiveKey(),
        provider: aiProvider,
        onComplete: (stickies: DetectedSticky[]) => {
          detectedStickies = stickies;
          navigate('review');
        },
        onError: (err: string) => {
          if (err.includes('API key')) {
            navigate('settings');
          } else {
            navigate('capture');
          }
        },
      });
      break;

    case 'review':
      renderReview(app, {
        stickies: detectedStickies,
        onCreateStickies: (stickies) => {
          parent.postMessage({
            pluginMessage: {
              type: 'create-stickies',
              stickies: stickies.map((s) => ({
                text: s.text,
                color: s.color,
              })),
            },
          }, '*');
        },
        onBack: () => navigate('capture'),
      });
      break;

    case 'success': {
      const count = (data as { count: number })?.count ?? 0;
      renderSuccess(app, count);
      break;
    }
  }
}

function renderSuccess(container: HTMLElement, count: number) {
  container.innerHTML = `
    <div class="success">
      <div class="success-icon">&#10003;</div>
      <h2>${count} sticky note${count !== 1 ? 's' : ''} created!</h2>
      <p>Your sticky notes have been added to the FigJam board.</p>
      <div class="success-actions">
        <button class="btn btn-secondary" id="scan-more">Scan More</button>
        <button class="btn btn-primary" id="done">Done</button>
      </div>
    </div>
  `;

  container.querySelector('#scan-more')!.addEventListener('click', () => navigate('capture'));
  container.querySelector('#done')!.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'cancel' } }, '*');
  });
}

// Listen for messages from plugin
window.onmessage = (event) => {
  const msg = event.data.pluginMessage as PluginToUIMessage | undefined;
  if (!msg) return;

  if (msg.type === 'stickies-created') {
    navigate('success', { count: msg.count });
  }

  if (msg.type === 'error') {
    alert('Error: ' + msg.message);
  }

  if (msg.type === 'api-key-loaded') {
    const data = msg as unknown as {
      type: string;
      provider: string;
      anthropicKey: string;
      openaiKey: string;
      relayUrl: string;
    };
    aiProvider = (data.provider as AIProvider) || 'anthropic';
    anthropicKey = data.anthropicKey || '';
    openaiKey = data.openaiKey || '';
    relayUrl = data.relayUrl || '';
    navigate('welcome');
  }
};

// Request saved settings from plugin on startup
parent.postMessage({ pluginMessage: { type: 'load-api-key' } }, '*');
