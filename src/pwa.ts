import { assetUrl } from "./asset-url";

let registration: ServiceWorkerRegistration | undefined;
let ready = false, reloading = false, started = false;

function refresh() {
  document.documentElement.dataset.offlineReady = String(ready);
  const notice = document.querySelector<HTMLElement>("#pwa-update-notice");
  if (notice) notice.hidden = !registration?.waiting;
}

export async function initPwa(_notify: (message: string) => void) {
  if (started || !import.meta.env.PROD || !window.isSecureContext || !("serviceWorker" in navigator)) return;
  started = true;
  try {
    registration = await navigator.serviceWorker.register(assetUrl("sw.js"), {
      scope: import.meta.env.BASE_URL, updateViaCache: "none",
    });
    const watch = () => {
      const worker = registration?.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") refresh();
      });
    };
    registration.addEventListener("updatefound", watch);
    watch();
    refresh();
    void navigator.serviceWorker.ready.then(() => { ready = true; refresh(); });
    let lastCheck = Date.now();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - lastCheck > 3_600_000) {
        lastCheck = Date.now(); void registration?.update().catch(() => {});
      }
    });
  } catch { /* Offline registration is optional. */ }
  refresh();
}

if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (reloading) location.reload();
  else refresh();
});
document.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-pwa-action]");
  if (!button) return;
  if (button.dataset.pwaAction === "update" && registration?.waiting) {
    reloading = true;
    button.disabled = true;
    registration.waiting.postMessage({ type: "RHINE_APPLY_UPDATE" });
  }
});
