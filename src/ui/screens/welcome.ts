import logoUrl from '../../../Sticky2FigmaLogo.png';

export interface WelcomeCallbacks {
  onGetStarted: () => void;
  onSettings: () => void;
}

export function renderWelcome(container: HTMLElement, callbacks: WelcomeCallbacks) {
  container.innerHTML = `
    <div class="welcome">
      <img src="${logoUrl}" alt="Sticky2Figma" class="welcome-logo">
      <h2>Sticky2Figma</h2>
      <p>Capture physical sticky notes and bring them into your FigJam board.</p>
      <div class="welcome-steps">
        <ol>
          <li>Take a photo of your sticky notes (or upload an image)</li>
          <li>AI detects each sticky, reads the text, and matches colors</li>
          <li>Review and edit, then add them all to your board</li>
        </ol>
      </div>
      <button class="btn btn-primary btn-full" id="get-started">Get Started</button>
      <button class="btn btn-secondary btn-full" id="settings" style="margin-top: -8px;">Settings</button>
    </div>
  `;

  container.querySelector('#get-started')!.addEventListener('click', callbacks.onGetStarted);
  container.querySelector('#settings')!.addEventListener('click', callbacks.onSettings);
}
