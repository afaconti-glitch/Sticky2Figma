export type AIProvider = 'anthropic' | 'openai';

export interface SettingsCallbacks {
  onSave: (provider: AIProvider, apiKey: string, relayUrl: string) => void;
  onBack: () => void;
  currentProvider: AIProvider;
  currentKey: string;
  currentRelayUrl: string;
}

const PROVIDER_INFO: Record<AIProvider, { label: string; placeholder: string; url: string; urlLabel: string }> = {
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

  const info = PROVIDER_INFO[callbacks.currentProvider];

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px; flex: 1;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-secondary" id="back-btn" style="padding: 4px 8px;">&#8592;</button>
        <h2 style="margin: 0;">Settings</h2>
      </div>
      <div>
        <label style="font-weight: 600; display: block; margin-bottom: 6px;">AI Provider</label>
        <div style="display: flex; gap: 8px;">
          <button class="btn provider-btn ${callbacks.currentProvider === 'anthropic' ? 'btn-primary' : 'btn-secondary'}" id="provider-anthropic" style="flex: 1; font-size: 12px;">Anthropic</button>
          <button class="btn provider-btn ${callbacks.currentProvider === 'openai' ? 'btn-primary' : 'btn-secondary'}" id="provider-openai" style="flex: 1; font-size: 12px;">OpenAI</button>
        </div>
      </div>
      <div>
        <label style="font-weight: 600; display: block; margin-bottom: 6px;" id="key-label">${info.label}</label>
        <p style="font-size: 11px;" id="key-help">Get a key at
          <a href="${info.url}" target="_blank" style="color: #18A0FB;" id="key-link">${info.urlLabel}</a></p>
        <input type="password" id="api-key-input" placeholder="${info.placeholder}" value="${callbacks.currentKey}"
          style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px; font-family: monospace;">
        ${masked ? `<p style="font-size: 11px; color: #999; margin-top: 4px;" id="masked-key">Current: ${masked}</p>` : ''}
      </div>
      <div>
        <label style="font-weight: 600; display: block; margin-bottom: 6px;">Relay Server URL</label>
        <p style="font-size: 11px; color: #666; margin-bottom: 6px;">For "Scan with Phone". Run <code style="background:#f0f0f0; padding:1px 4px; border-radius:3px;">npm run relay</code> then paste the URL shown.</p>
        <input type="text" id="relay-url-input" placeholder="http://192.168.1.X:3000"
          value="${callbacks.currentRelayUrl}"
          style="width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 12px;">
      </div>
      <button class="btn btn-primary btn-full" id="save-btn">Save</button>
    </div>
  `;

  let selectedProvider: AIProvider = callbacks.currentProvider;

  function updateProviderUI(provider: AIProvider) {
    selectedProvider = provider;
    const pInfo = PROVIDER_INFO[provider];
    const antBtn = container.querySelector('#provider-anthropic')!;
    const oaiBtn = container.querySelector('#provider-openai')!;
    antBtn.className = `btn provider-btn ${provider === 'anthropic' ? 'btn-primary' : 'btn-secondary'}`;
    oaiBtn.className = `btn provider-btn ${provider === 'openai' ? 'btn-primary' : 'btn-secondary'}`;
    (container.querySelector('#key-label') as HTMLElement).textContent = pInfo.label;
    const helpEl = container.querySelector('#key-help') as HTMLElement;
    helpEl.innerHTML = `Get a key at <a href="${pInfo.url}" target="_blank" style="color: #18A0FB;">${pInfo.urlLabel}</a>`;
    const input = container.querySelector('#api-key-input') as HTMLInputElement;
    input.placeholder = pInfo.placeholder;
    input.value = '';
    const maskedEl = container.querySelector('#masked-key');
    if (maskedEl) maskedEl.remove();
  }

  container.querySelector('#provider-anthropic')!.addEventListener('click', () => updateProviderUI('anthropic'));
  container.querySelector('#provider-openai')!.addEventListener('click', () => updateProviderUI('openai'));

  container.querySelector('#back-btn')!.addEventListener('click', callbacks.onBack);
  container.querySelector('#save-btn')!.addEventListener('click', () => {
    const keyInput = container.querySelector('#api-key-input') as HTMLInputElement;
    const key = keyInput.value.trim();
    if (!key) {
      alert('Please enter an API key');
      return;
    }
    const relayInput = container.querySelector('#relay-url-input') as HTMLInputElement;
    const relayUrl = relayInput.value.trim();
    callbacks.onSave(selectedProvider, key, relayUrl);
  });
}
