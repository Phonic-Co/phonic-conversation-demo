export type WebSocketData = {
  streamSid: string | null;
  speaking: boolean;
  transcribe: (audioinBase64: string) => void;
  promptLLM: (prompt: string) => Promise<void>;
  generateSpeech: (script: string) => void;
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
