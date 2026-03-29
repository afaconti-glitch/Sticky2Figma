// UI -> Plugin messages
export interface CreateStickiesMessage {
  type: 'create-stickies';
  stickies: Array<{
    text: string;
    color: { r: number; g: number; b: number };
  }>;
}

export interface CancelMessage {
  type: 'cancel';
}

export interface SaveRelayUrlMessage {
  type: 'save-relay-url';
  url: string;
}

export interface LoadRelayUrlMessage {
  type: 'load-relay-url';
}

export type UIToPluginMessage = CreateStickiesMessage | CancelMessage | SaveRelayUrlMessage | LoadRelayUrlMessage;

// Plugin -> UI messages
export interface StickiesCreatedMessage {
  type: 'stickies-created';
  count: number;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface RelayUrlLoadedMessage {
  type: 'relay-url-loaded';
  url: string;
}

export type PluginToUIMessage = StickiesCreatedMessage | ErrorMessage | RelayUrlLoadedMessage;
