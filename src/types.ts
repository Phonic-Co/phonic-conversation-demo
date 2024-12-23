export type WebSocketData = {
  streamSid: string | null;
  speaking: boolean;
  transcribe: (audioinBase64: string) => void;
  promptLLM: (prompt: string) => Promise<void>;
  phonic: {
    sendText(text: string): void;
    flush(): void;
    stop(): void;
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
