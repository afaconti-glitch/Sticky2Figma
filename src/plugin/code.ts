import type { UIToPluginMessage } from './messages';

if (figma.editorType === 'figjam') {
  figma.showUI(__html__, { width: 400, height: 550, title: 'Sticky2Figma' });

  figma.ui.onmessage = async (msg: UIToPluginMessage & { type: string; key?: string; provider?: string; url?: string }) => {
    if (msg.type === 'load-api-key') {
      const provider = (await figma.clientStorage.getAsync('ai-provider')) || 'anthropic';
      const anthropicKey = (await figma.clientStorage.getAsync('anthropic-api-key')) || '';
      const openaiKey = (await figma.clientStorage.getAsync('openai-api-key')) || '';
      const relayUrl = (await figma.clientStorage.getAsync('relay-url')) || '';
      figma.ui.postMessage({ type: 'api-key-loaded', provider, anthropicKey, openaiKey, relayUrl });
    }

    if (msg.type === 'save-api-key') {
      const provider = msg.provider || 'anthropic';
      await figma.clientStorage.setAsync('ai-provider', provider);
      if (provider === 'anthropic') {
        await figma.clientStorage.setAsync('anthropic-api-key', msg.key || '');
      } else {
        await figma.clientStorage.setAsync('openai-api-key', msg.key || '');
      }
    }

    if (msg.type === 'save-relay-url') {
      await figma.clientStorage.setAsync('relay-url', msg.url || '');
    }

    if (msg.type === 'create-stickies') {
      try {
        await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

        const center = figma.viewport.center;
        const cols = 3;
        const spacing = 260;
        const nodes: SceneNode[] = [];

        for (let i = 0; i < msg.stickies.length; i++) {
          const item = msg.stickies[i];
          const col = i % cols;
          const row = Math.floor(i / cols);

          const sticky = figma.createSticky();
          sticky.text.characters = item.text;
          sticky.fills = [{ type: 'SOLID', color: item.color }];

          const totalCols = Math.min(msg.stickies.length, cols);
          const totalRows = Math.ceil(msg.stickies.length / cols);
          sticky.x = center.x + (col - totalCols / 2) * spacing;
          sticky.y = center.y + (row - totalRows / 2) * spacing;

          nodes.push(sticky);
        }

        figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);

        figma.ui.postMessage({
          type: 'stickies-created',
          count: nodes.length,
        });
      } catch (err) {
        figma.ui.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to create stickies',
        });
      }
    }

    if (msg.type === 'cancel') {
      figma.closePlugin();
    }
  };
} else {
  figma.closePlugin('Sticky2Figma only works in FigJam.');
}
