"use client";

import { Bell, BellOff } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/** SPEC Mục 11.1 — bật/tắt nhận thông báo Web push (P2) trên trình duyệt này. */
export function PushToggle() {
  const [supported, setSupported] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    // SSR render luôn ra `false` (không có navigator) — cập nhật lại sau khi hydrate xong
    // trên trình duyệt thật sự hỗ trợ Push, nên không thể suy ra giá trị này khi render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true);
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    });
  }, []);

  if (!supported) return null;

  async function toggle() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (subscribed) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setSubscribed(false);
        toast.success("Đã tắt thông báo đẩy trên trình duyệt này.");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Bạn chưa cho phép nhận thông báo.");
        return;
      }
      const { publicKey } = await fetch("/api/push/vapid-public-key").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setSubscribed(true);
      toast.success("Đã bật thông báo đẩy trên trình duyệt này.");
    } catch {
      toast.error("Không bật được thông báo đẩy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={subscribed ? "Tắt thông báo đẩy trên trình duyệt này" : "Bật thông báo đẩy trên trình duyệt này"}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted"
    >
      {subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {subscribed ? "Tắt thông báo đẩy" : "Bật thông báo đẩy"}
    </button>
  );
}
