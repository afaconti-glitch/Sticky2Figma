import { startOpenRouterAuth } from '../auth/openrouter';

export type AIProvider = 'anthropic' | 'openai' | 'openrouter';

export interface SettingsCallbacks {
  onSave: (provider: AIProvider, apiKey: string) => void;
  onBack: () => void;
  currentProvider: AIProvider;
  currentKey: string;
  relayUrl: string;
}

const PROVIDER_INFO: Record<string, { label: string; placeholder: string; url: string; urlLabel: string }> = {
  anthropic: {
    label: 'Anthropic API Key',
    placeholder: 'sk-ant-...',
    url: 'https://console.anthropic.com/',
    urlLabel: 'console.anthropic.com',
  },
  openai: {
    label: 'OpenAI API Key',
    placeholder: 'sk-...',
    url: 'https://platform.openai.com/api-keys',
    urlLabel: 'platform.openai.com',
  },
};

export function renderSettings(container: HTMLElement, callbacks: SettingsCallbacks) {
  const masked = callbacks.currentKey
    ? callbacks.currentKey.substring(0, 10) + '...' + callbacks.currentKey.slice(-4)
    : '';

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px; flex: 1;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-secondary" id="back-btn" style="padding: 4px 8px;">&#8592;</button>
        <h2 style="margin: 0;">Settings</h2>
      </div>
      <div>
        <label style="font-weight: 600; display: block; margin-bottom: 6px;">AI Provider</label>
        <div style="display: flex; gap: 8px;">
          <button class="btn provider-btn ${callbacks.currentProvider === 'openrouter' ? 'btn-primary' : 'btn-secondary'}" id="provider-openrouter" style="flex: 1; font-size: 12px;">OpenRouter</button>
          <button class="btn provider-btn ${callbacks.currentProvider === 'anthropic' ? 'btn-primary' : 'btn-secondary'}" id="provider-anthropic" style="flex: 1; font-size: 12px;">Anthropic</button>
          <button class="btn provider-btn ${callbacks.currentProvider === 'openai' ? 'btn-primary' : 'btn-secondary'}" id="provider-openai" style="flex: 1; font-size: 12px;">OpenAI</button>
        </div>
      </div>
      <div id="auth-section"></div>
    </div>
  `;

  let selectedProvider: AIProvider = callbacks.currentProvider;
  let authCancel: (() => void) | null = null;

  function renderAuthSection() {
    const section = container.querySelector('#auth-section') as HTMLElement;

    if (selectedProvider === 'openrouter') {
      const isConnected = callbacks.currentProvider === 'openrouter' && callbacks.currentKey;
      section.innerHTML = isConnected
        ? `
          <div style="text-align: center; padding: 16px 0;">
            <div style="color: #22c55e; font-size: 24px; margin-bottom: 8px;">&#10003;</div>
            <p style="font-weight: 600; margin-bottom: 4px;">Connected to OpenRouter</p>
            <p style="font-size: 11px; color: #999; margin-bottom: 16px;">Logged in via OAuth</p>
            <button class="btn btn-secondary btn-full" id="reauth-btn" style="margin-bottom: 8px;">Re-authenticate</button>
            <button class="btn btn-primary btn-full" id="continue-btn">Continue</button>
          </div>`
        : `
          <div style="text-align: center; padding: 16px 0;">
            <p style="font-size: 13px; color: #666; margin-bottom: 16px;">Log in with your OpenRouter account to use AI models (Claude, GPT-4, and more).</p>
            <button class="btn btn-primary btn-full" id="login-btn">Login with OpenRouter</button>
            <div id="oauth-status" style="margin-top: 12px; font-size: 12px;"></div>
          </div>`;

      if (isConnected) {
        section.querySelector('#reauth-btn')!.addEventListener('click', startOAuth);
        section.querySelector('#continue-btn')!.addEventListener('click', () => {
          callbacks.onSave('openrouter', callbacks.currentKey);
        });
      } else {
        section.querySelector('#login-btn')!.addEventListener('click', startOAuth);
      }
    } else {
      const info = PROVIDER_INFO[selectedProvider];
      const currentKeyForProvider = callbacks.currentProvider === selectedProvider ? callbacks.currentKey : '';
      const maskedKey = currentKeyForProvider
        ? currentKeyForProvider.substring(0, 10) + '...' + currentKeyForProvider.slice(-4)
        : '';

      section.innerHTML = `
        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 6px;">${info.label}</label>
          <p style="font-size: 11px;">Get a key at
            <a href="${info.url}" target="_blank" style="color: #18A0FB;">${info.urlLabel}</a></p>
          <input type="password" id="api-key-input" placeholder="${info.placeholder}" value="${currentKeyForProvider}"
            style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; font-family: monospace;">
          ${maskedKey ? `<p style="font-size: 11px; color: #999; margin-top: 4px;">Current: ${maskedKey}</p>` : ''}
        </div>
        <button class="btn btn-primary btn-full" id="save-btn" style="margin-top: 12px;">Save</button>`;

      section.querySelector('#save-btn')!.addEventListener('click', () => {
        const keyInput = section.querySelector('#api-key-input') as HTMLInputElement;
        const key = keyInput.value.trim();
        if (!key) {
          alert('Please enter an API key');
          return;
        }
        callbacks.onSave(selectedProvider, key);
      });
    }
  }

  async function startOAuth() {
    const statusEl = container.querySelector('#oauth-status') || (() => {
      const el = document.createElement('div');
      el.id = 'oauth-status';
      el.style.cssText = 'margin-top: 12px; font-size: 12px;';
      container.querySelector('#auth-section')!.appendChild(el);
      return el;
    })();

    try {
      (statusEl as HTMLElement).innerHTML = '<span style="color: #f0a500;">Starting authentication...</span>';

      const auth = await startOpenRouterAuth(callbacks.relayUrl);
      authCancel = auth.cancel;

      // Open auth URL in browser
      window.open(auth.authUrl, '_blank');

      (statusEl as HTMLElement).innerHTML = '<span style="color: #f0a500;">Waiting for authentication... (check your browser)</span>';

      const key = await auth.pollForKey();
      authCancel = null;

      // Save and continue
      callbacks.onSave('openrouter', key);
    } catch (err) {
      authCancel = null;
      (statusEl as HTMLElement).innerHTML = `<span style="color: #f24822;">${err instanceof Error ? err.message : 'Authentication failed'}</span>`;
    }
  }

  function selectProvider(provider: AIProvider) {
    if (authCancel) { authCancel(); authCancel = null; }
    selectedProvider = provider;
    container.querySelector('#provider-openrouter')!.className =
      `btn provider-btn ${provider === 'openrouter' ? 'btn-primary' : 'btn-secondary'}`;
    container.querySelector('#provider-anthropic')!.className =
      `btn provider-btn ${provider === 'anthropic' ? 'btn-primary' : 'btn-secondary'}`;
    container.querySelector('#provider-openai')!.className =
      `btn provider-btn ${provider === 'openai' ? 'btn-primary' : 'btn-secondary'}`;
    renderAuthSection();
  }

  container.querySelector('#provider-openrouter')!.addEventListener('click', () => selectProvider('openrouter'));
  container.querySelector('#provider-anthropic')!.addEventListener('click', () => selectProvider('anthropic'));
  container.querySelector('#provider-openai')!.addEventListener('click', () => selectProvider('openai'));
  container.querySelector('#back-btn')!.addEventListener('click', () => {
    if (authCancel) { authCancel(); authCancel = null; }
    callbacks.onBack();
  });

  renderAuthSection();
}
