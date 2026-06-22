import { useState, useEffect } from "react";
import { toast } from "../store.js";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const dismissed = () => {
  try {
    return localStorage.getItem("kanitidi_install_dismiss") === "1";
  } catch {
    return false;
  }
};

// Module-level capture of the beforeinstallprompt event (it can fire before
// React mounts this component).
let deferredPrompt = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new Event("kanitidi-installable"));
  });
}

export default function InstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissed()) return;
    if (deferredPrompt || isIOS()) setShow(true);
    const onInstallable = () => {
      if (!isStandalone() && !dismissed()) setShow(true);
    };
    const onInstalled = () => {
      deferredPrompt = null;
      setShow(false);
    };
    window.addEventListener("kanitidi-installable", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("kanitidi-installable", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  const install = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(() => {
        deferredPrompt = null;
        setShow(false);
      });
    } else if (isIOS()) {
      toast("Safari માં: Share (⬆️) → 'Add to Home Screen' દબાવો", "gold");
    } else {
      toast("Browser menu → 'Install app' / 'Add to Home screen'", "gold");
    }
  };

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem("kanitidi_install_dismiss", "1");
    } catch {}
  };

  return (
    <div className="install-banner">
      <span className="ib-text">📲 Install Kali ni Tidi as an app</span>
      <button className="btn" onClick={install}>
        Add as app
      </button>
      <button className="ib-x" onClick={dismiss} title="Dismiss">
        ✕
      </button>
    </div>
  );
}
