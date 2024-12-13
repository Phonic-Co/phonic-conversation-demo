export type WebSocketData = {
  streamSid: string | null;
  speaking: boolean;
  transcribe: (audioinBase64: string) => void;
  promptLLM: (prompt: string) => Promise<void>;
  phonic: {
    sendTextChunk(text: string): void;
    sendFlush(): void;
    sendStop(): void;
  };
};

export type TwilioWebSocketMessage =
  | {
      event: "start";
      streamSid: string;
    }
  | {
      event: "media";
      media: {
        track: "inbound" | "outbound";
        payload: string;
      };
    }
  | {
      event: "stop";
    };
