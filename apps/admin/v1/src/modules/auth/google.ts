let scriptPromise: Promise<void> | null = null;
export function loadGoogleIdentity() {
  if (window.google) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    document.querySelector("script[data-lif-google]")?.remove();
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      script.remove();
      scriptPromise = null;
      reject(new Error("Google sign-in timed out."));
    }, 15_000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.dataset.lifGoogle = "true";
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.google) resolve();
      else {
        scriptPromise = null;
        reject(new Error("Google sign-in did not initialize."));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      scriptPromise = null;
      script.remove();
      reject(new Error("Google sign-in could not load."));
    };
    document.head.append(script);
  });
  return scriptPromise;
}
