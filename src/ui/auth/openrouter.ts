import { generateCodeVerifier, generateCodeChallenge } from './pkce';

export interface AuthResult {
  authUrl: string;
  pollForKey: () => Promise<string>;
  cancel: () => void;
}

export async function startOpenRouterAuth(relayUrl: string): Promise<AuthResult> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Ask relay to create an OAuth session
  const res = await fetch(`${relayUrl}/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code_challenge: codeChallenge }),
  });

  if (!res.ok) throw new Error('Failed to start OAuth session');
  const { state, authUrl } = await res.json();

  let cancelled = false;

  async function pollForKey(): Promise<string> {
    // Poll relay for the auth code
    while (!cancelled) {
      await new Promise(r => setTimeout(r, 2000));
      if (cancelled) throw new Error('Authentication cancelled');

      const pollRes = await fetch(`${relayUrl}/oauth/poll/${state}`);
      if (pollRes.status === 410) throw new Error('Authentication session expired. Please try again.');
      if (!pollRes.ok) continue;

      const data = await pollRes.json();
      if (!data.ready) continue;

      // Exchange code for API key
      const exchangeRes = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: data.code,
          code_verifier: codeVerifier,
          code_challenge_method: 'S256',
        }),
      });

      if (!exchangeRes.ok) {
        const err = await exchangeRes.text();
        throw new Error(`Failed to exchange auth code: ${err}`);
      }

      const { key } = await exchangeRes.json();
      return key;
    }
    throw new Error('Authentication cancelled');
  }

  function cancel() {
    cancelled = true;
  }

  return { authUrl, pollForKey, cancel };
}
