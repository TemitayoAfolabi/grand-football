'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const register = () => {
      const schedule =
        window.requestIdleCallback ??
        ((callback: IdleRequestCallback) => {
          timeoutId = window.setTimeout(callback, 1_000);
          return timeoutId;
        });

      idleId = schedule(() => {
        void navigator.serviceWorker.register('/sw.js').catch(() => {
          // The website remains fully usable when service-worker registration fails.
        });
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      window.removeEventListener('load', register);
      if (idleId !== undefined && window.cancelIdleCallback) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
