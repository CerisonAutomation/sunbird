/**
 * Push notification system for re-engagement.
 * Uses the Web Push API with VAPID keys.
 * Falls back gracefully when not supported.
 */

export class Notifications {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private supported = false;
  private subscribed = false;

  async init(): Promise<void> {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      this.supported = false;
      return;
    }
    this.supported = true;
    try {
      this.swRegistration = await navigator.serviceWorker.ready;
      const subscription = await this.swRegistration.pushManager.getSubscription();
      this.subscribed = !!subscription;
    } catch {
      this.supported = false;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.supported) return false;
    if (this.subscribed) return true;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";
    if (!vapidKey) return false;

    try {
      await this.swRegistration!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidKey),
      });
      this.subscribed = true;
      return true;
    } catch {
      return false;
    }
  }

  isSupported(): boolean {
    return this.supported;
  }

  isSubscribed(): boolean {
    return this.subscribed;
  }

  private urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
  }
}
