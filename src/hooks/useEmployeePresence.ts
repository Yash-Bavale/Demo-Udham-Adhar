import { useEffect, useRef } from "react";
import { recordHeartbeat } from "@/lib/crm/employee-sessions.functions";
import { useRouterState } from "@tanstack/react-router";

function getBrowserInfo(): { browser: string; browserVersion?: string; os: string; deviceType: string } {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { browser: "Chrome", os: "Windows", deviceType: "Desktop" };
  }

  const ua = navigator.userAgent;
  let browser = "Chrome";
  let browserVersion: string | undefined;

  if (ua.includes("Firefox/")) {
    browser = "Firefox";
    browserVersion = ua.split("Firefox/")[1]?.split(" ")[0];
  } else if (ua.includes("Edg/")) {
    browser = "Edge";
    browserVersion = ua.split("Edg/")[1]?.split(" ")[0];
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    browser = "Safari";
    browserVersion = ua.split("Version/")[1]?.split(" ")[0];
  } else if (ua.includes("Chrome/")) {
    browser = "Chrome";
    browserVersion = ua.split("Chrome/")[1]?.split(" ")[0];
  }

  let os = "Windows";
  if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  let deviceType = "Desktop";
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) deviceType = "Mobile";

  return { browser, browserVersion, os, deviceType };
}

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "sess_default";
  try {
    let sid = window.sessionStorage.getItem("crm_employee_session_id");
    if (!sid) {
      sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      window.sessionStorage.setItem("crm_employee_session_id", sid);
    }
    return sid;
  } catch {
    return `sess_${Date.now()}`;
  }
}

export function useEmployeePresence(options?: {
  currentModule?: string;
  currentOrderId?: string | null;
  currentOrderCode?: string | null;
  lastActionText?: string | null;
}) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const currentPathRef = useRef(currentPath);
  currentPathRef.current = currentPath;

  const lastActivityRef = useRef<number>(Date.now());
  const activeSecondsRef = useRef<number>(0);
  const idleSecondsRef = useRef<number>(0);
  const awaySecondsRef = useRef<number>(0);
  const statusRef = useRef<"ACTIVE" | "IDLE" | "AWAY" | "OFFLINE">("ACTIVE");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sessionId = getOrCreateSessionId();
    const { browser, browserVersion, os, deviceType } = getBrowserInfo();

    // Reset activity timer on user interaction
    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      if (document.visibilityState === "visible") {
        statusRef.current = "ACTIVE";
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        statusRef.current = "AWAY";
      } else {
        lastActivityRef.current = Date.now();
        statusRef.current = "ACTIVE";
        void sendHeartbeat();
      }
    };

    const handleFocus = () => {
      lastActivityRef.current = Date.now();
      statusRef.current = "ACTIVE";
      void sendHeartbeat();
    };

    window.addEventListener("pointerdown", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });
    window.addEventListener("click", handleUserActivity, { passive: true });
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 1-second ticker for accumulation
    const ticker = setInterval(() => {
      const now = Date.now();
      const inactiveMs = now - lastActivityRef.current;

      if (document.visibilityState === "hidden") {
        statusRef.current = "AWAY";
        awaySecondsRef.current += 1;
      } else if (inactiveMs > 10 * 60 * 1000) {
        // > 10 minutes without interaction -> IDLE
        statusRef.current = "IDLE";
        idleSecondsRef.current += 1;
      } else {
        statusRef.current = "ACTIVE";
        activeSecondsRef.current += 1;
      }
    }, 1000);

    // Heartbeat every 30-45 seconds
    const sendHeartbeat = async () => {
      const activeDelta = activeSecondsRef.current;
      const idleDelta = idleSecondsRef.current;
      const awayDelta = awaySecondsRef.current;

      activeSecondsRef.current = 0;
      idleSecondsRef.current = 0;
      awaySecondsRef.current = 0;

      const path = currentPathRef.current || "/admin";
      const opts = optionsRef.current;

      try {
        const res = await recordHeartbeat({
          data: {
            sessionId,
            presenceStatus: statusRef.current,
            currentPage: path,
            currentModule:
              opts?.currentModule ||
              (path.includes("order")
                ? "Orders"
                : path.includes("support") || path.includes("ticket")
                ? "Support"
                : path.includes("lead")
                ? "Leads"
                : "General"),
            currentOrderId: opts?.currentOrderId ?? null,
            currentOrderCode: opts?.currentOrderCode ?? null,
            lastActionText: opts?.lastActionText ?? null,
            activeSecondsDelta: activeDelta,
            idleSecondsDelta: idleDelta,
            awaySecondsDelta: awayDelta,
            browser,
            browserVersion,
            os,
            deviceType,
          },
        });

        if (res && res.terminated) {
          alert(res.logout_reason || "Your active session has been terminated by an administrator.");
          const { supabase } = await import("@/integrations/supabase/client");
          try { window.sessionStorage.removeItem("crm_employee_session_id"); } catch { /* ignore */ }
          await supabase.auth.signOut({ scope: "local" });
          window.location.href = "/admin-login";
        }
      } catch (err) {
        console.warn("[EmployeePresence] Heartbeat error:", err);
      }
    };

    // Initial heartbeat
    void sendHeartbeat();
    const heartbeatTimer = setInterval(sendHeartbeat, 30_000);

    return () => {
      clearInterval(ticker);
      clearInterval(heartbeatTimer);
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("click", handleUserActivity);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}
