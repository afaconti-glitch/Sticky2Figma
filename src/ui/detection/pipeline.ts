import type { DetectedSticky } from '../types';
import type { AIProvider } from '../screens/settings';
import { FIGJAM_COLORS, mapToFigJamColor } from './color';

const MAX_DIMENSION = 1500;

/**
 * Resize an image if needed and return as base64 JPEG.
 */
function imageToBase64(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

interface StickyResult {
  stickies: Array<{
    text: string;
    color: string;
  }>;
}

function buildPrompt(): string {
  const colorNames = FIGJAM_COLORS.map((c) => c.name).join(', ');
  return `Look at this photo and identify all physical sticky notes visible in the image. For each sticky note, extract:
1. The handwritten or printed text on it (transcribe as accurately as possible)
2. The color of the sticky note (choose the closest match from: ${colorNames})

Respond with ONLY valid JSON in this exact format, no other text:
{"stickies": [{"text": "the text on the sticky", "color": "Yellow"}]}

If a sticky note is blank (no text), still include it with empty text. Only include actual sticky notes, not other objects.`;
}

/**
 * Call Claude Vision API.
 */
async function callAnthropicVision(base64Image: string, apiKey: string): Promise<StickyResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image,
              },
            },
            { type: 'text', text: buildPrompt() },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Check your Anthropic API key in settings.');
    }
    throw new Error(`Anthropic API error (${response.status}): ${err}`);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text;
  if (!content) throw new Error('Empty response from Anthropic API');

  return parseJsonResponse(content);
}

/**
 * Call OpenAI Vision API (GPT-4o).
 */
async function callOpenAIVision(base64Image: string, apiKey: string): Promise<StickyResult> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
            { type: 'text', text: buildPrompt() },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Check your OpenAI API key in settings.');
    }
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI API');

  return parseJsonResponse(content);
}

/**
 * Call OpenRouter Vision API (OpenAI-compatible format).
 */
async function callOpenRouterVision(base64Image: string, apiKey: string): Promise<StickyResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Title': 'Sticky2Figma',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
            { type: 'text', text: buildPrompt() },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key. Please re-authenticate with OpenRouter in settings.');
    }
    throw new Error(`OpenRouter API error (${response.status}): ${err}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenRouter API');

  return parseJsonResponse(content);
}

/**
 * Parse JSON from an LLM response, handling markdown code blocks.
 */
function parseJsonResponse(text: string): StickyResult {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return JSON.parse(jsonStr);
}

/**
 * Full processing pipeline using AI Vision API.
 */
export async function processImage(
  imageDataUrl: string,
  onStatus: (status: string) => void,
  apiKey: string,
  provider: AIProvider = 'anthropic',
): Promise<DetectedSticky[]> {
  onStatus('Preparing image...');
  const base64 = await imageToBase64(imageDataUrl);

  onStatus('Analyzing sticky notes with AI...');
  const result =
    provider === 'openai' ? await callOpenAIVision(base64, apiKey)
    : provider === 'openrouter' ? await callOpenRouterVision(base64, apiKey)
    : await callAnthropicVision(base64, apiKey);

  if (!result.stickies || result.stickies.length === 0) {
    return [];
  }

  onStatus(`Found ${result.stickies.length} sticky note${result.stickies.length !== 1 ? 's' : ''}!`);

  return result.stickies.map((sticky) => {
    const colorName = sticky.color || 'Yellow';
    const fjColor = FIGJAM_COLORS.find(
      (c) => c.name.toLowerCase() === colorName.toLowerCase(),
    ) || mapToFigJamColor({ r: 1, g: 0.9, b: 0.2 });

    return {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      text: sticky.text.trim(),
      color: { r: fjColor.r, g: fjColor.g, b: fjColor.b },
      originalColor: { r: fjColor.r, g: fjColor.g, b: fjColor.b },
      boundingBox: { x: 0, y: 0, w: 0, h: 0 },
      confidence: 0.95,
      thumbnailDataUrl: '',
    };
  });
}
