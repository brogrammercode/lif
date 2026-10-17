import "vite/client";

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
      }): void;
      renderButton(
        element: HTMLElement,
        options: {
          theme: string;
          size: string;
          width: number;
          text: string;
          shape: string;
        },
      ): void;
      disableAutoSelect(): void;
    };
  };
}
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
