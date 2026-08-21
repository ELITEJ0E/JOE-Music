import { useState, useEffect, useCallback, useRef } from "react";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState<boolean>(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    promptRef.current = deferredPrompt;
  }, [deferredPrompt]);

  useEffect(() => {
    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroidDevice = /android/.test(userAgent);

    if (isIOSDevice) {
      setPlatform("ios");
    } else if (isAndroidDevice) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    // Check if already running in standalone mode (installed PWA)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes("android-app://");

    setIsInstalled(isStandalone);

    // Listen for display-mode change
    const matcher = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsInstalled(e.matches);
    };
    matcher.addEventListener("change", handleDisplayModeChange);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      console.log("[PWA] Captured beforeinstallprompt event");
      setDeferredPrompt(event);
      promptRef.current = event;
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      console.log("[PWA] App successfully installed!");
      setIsInstalled(true);
      setDeferredPrompt(null);
      promptRef.current = null;
      setIsInstallModalOpen(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      matcher.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const openInstallModal = useCallback(() => {
    setIsInstallModalOpen(true);
  }, []);

  const closeInstallModal = useCallback(() => {
    setIsInstallModalOpen(false);
  }, []);

  const promptInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "modal"> => {
    const currentPrompt = promptRef.current || deferredPrompt;

    if (currentPrompt) {
      try {
        await currentPrompt.prompt();
        const choiceResult = await currentPrompt.userChoice;
        console.log(`[PWA] User choice: ${choiceResult.outcome}`);
        
        if (choiceResult.outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
          promptRef.current = null;
          setIsInstallModalOpen(false);
          return "accepted";
        } else {
          return "dismissed";
        }
      } catch (err) {
        console.warn("[PWA] Prompt install error:", err);
        setIsInstallModalOpen(true);
        return "modal";
      }
    } else {
      // If no native prompt is captured (e.g. iOS Safari, Firefox, or already deferred), show custom guide modal
      setIsInstallModalOpen(true);
      return "modal";
    }
  }, [deferredPrompt]);

  return {
    isInstallable: !isInstalled,
    isInstalled,
    isIOS: platform === "ios",
    platform,
    hasPrompt: !!deferredPrompt,
    isInstallModalOpen,
    openInstallModal,
    closeInstallModal,
    promptInstall,
  };
}
