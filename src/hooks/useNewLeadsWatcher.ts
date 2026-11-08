import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications, playNotificationSound } from "@/hooks/useNotifications";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";

export function useNewLeadsWatcher() {
  const [unseen, setUnseen] = useState(0);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { notify } = useNotifications();
  const qc = useQueryClient();
  const role = useRole();
  const userPerms = usePermissions();

  const isSuperAdmin = role.has("super_admin");
  const isManager = role.has("manager");
  const isAdm = isSuperAdmin || (role.has("admin") && !isManager);
  const isLoaded = !role.loading && !userPerms.isLoading;
  const canSeeLeads = isLoaded && (isAdm || isManager || (role.can("leads") && userPerms.can("leads", "view")));
  const canSeeOrders = isLoaded && (isAdm || isManager || (role.can("orders") && userPerms.can("orders", "view")));

  // Keep live references to permissions to prevent stale closure issues in realtime websocket callbacks
  const livePermsRef = useRef({
    isSuperAdmin,
    isManager,
    isAdmin: isAdm,
    canSeeLeads,
    canSeeOrders,
    rolesLoading: !isLoaded,
  });

  useEffect(() => {
    livePermsRef.current = {
      isSuperAdmin,
      isManager,
      isAdmin: isAdm,
      canSeeLeads,
      canSeeOrders,
      rolesLoading: !isLoaded,
    };
  }, [isSuperAdmin, isManager, isAdm, canSeeLeads, canSeeOrders, isLoaded]);

  // Deduplication cache: key -> timestamp (ms) to avoid duplicate toasts & sounds for same event
  const notifiedKeysRef = useRef<Map<string, number>>(new Map());

  // Reset counter when user enters the leads section.
  useEffect(() => {
    if (path.startsWith("/admin/leads")) setUnseen(0);
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const invalidateLeadsData = () => {
      qc.invalidateQueries({ queryKey: ["admin.leads"] });
      qc.invalidateQueries({ queryKey: ["admin.leadCounts"] });
      qc.invalidateQueries({ queryKey: ["my-work"] });
    };

    const invalidateOrdersData = () => {
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["admin.orders"] });
      qc.invalidateQueries({ queryKey: ["my-work"] });
    };

    const triggerNotification = (
      dedupeKey: string,
      title: string,
      body: string,
      url: string,
      kind: "lead" | "order" = "lead"
    ) => {
      const now = Date.now();
      const lastTime = notifiedKeysRef.current.get(dedupeKey) ?? 0;
      if (now - lastTime < 10000) return; // Skip if notified within last 10s
      notifiedKeysRef.current.set(dedupeKey, now);

      // Clean up old keys
      for (const [k, t] of notifiedKeysRef.current.entries()) {
        if (now - t > 60000) notifiedKeysRef.current.delete(k);
      }

      if (kind === "lead") {
        setUnseen((n) => n + 1);
        invalidateLeadsData();
      } else {
        invalidateOrdersData();
      }

      // Leads never ring, pop up, or send desktop alerts — the list refreshes silently.
      if (kind === "lead") return;

      // Check sound configuration
      const soundEnabled = false
        ? localStorage.getItem("udyam.sound.leads") !== "false"
        : localStorage.getItem("udyam.sound.orders") !== "false";

      if (soundEnabled) {
        playNotificationSound(kind);
      }

      // Check desktop browser notification
      notify({ title, body, url, tag: dedupeKey });

      // Check CRM bottom-right in-app toast notification toggle
      const toastEnabled = false
        ? localStorage.getItem("udyam.toast.leads") !== "false"
        : localStorage.getItem("udyam.toast.orders") !== "false";

      if (toastEnabled) {
        toast.info(title, {
          description: body,
          duration: 6000,
          action: { label: "View Details", onClick: () => { window.location.href = url; } },
        });
      }
    };

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const topic = `user:${uid}:crm:watcher:${Math.random().toString(36).slice(2)}`;

      channel = supabase
        .channel(topic)
        // 1. Leads Table Events
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "leads" },
          () => {
            invalidateLeadsData();
          }
        )
        .on(
          "postgres_changes" as never,
          { event: "INSERT", schema: "public", table: "leads" },
          (payload: { new?: { id?: string; name?: string | null; full_name?: string | null; phone?: string | null; service_slug?: string | null; assigned_to?: string | null } }) => {
            const { isAdmin: isAdm, canSeeLeads: canLeads, rolesLoading } = livePermsRef.current;
            // If permissions still loading or user has no access to leads module, do NOT notify or play sound
            if (rolesLoading || !canLeads) return;

            const lead = payload.new ?? {};
            if (!isAdm && lead.assigned_to !== uid) return;

            const dedupeKey = lead.id ? `lead-${lead.id}` : `lead-${lead.name}-${lead.phone}`;
            const title = "🔔 New lead received!";
            const body = [lead.name || lead.full_name, lead.service_slug, lead.phone].filter(Boolean).join(" · ") || "Open the leads queue";
            const url = lead.id ? `/admin/leads/${lead.id}` : "/admin/leads";

            triggerNotification(dedupeKey, title, body, url, "lead");
          },
        )
        .on(
          "postgres_changes" as never,
          { event: "UPDATE", schema: "public", table: "leads" },
          (payload: { old?: { assigned_to?: string | null }; new?: { id?: string; name?: string | null; full_name?: string | null; lead_code?: string | null; assigned_to?: string | null } }) => {
            const { canSeeLeads: canLeads, rolesLoading } = livePermsRef.current;
            if (rolesLoading || !canLeads) return;

            const newLead = payload.new ?? {};
            const oldLead = payload.old ?? {};

            invalidateLeadsData();

            if (newLead.assigned_to === uid && oldLead.assigned_to !== uid) {
              const dedupeKey = newLead.id ? `lead-assigned-${newLead.id}` : `lead-assigned-${Date.now()}`;
              const title = "🎯 Lead Assigned to You";
              const body = `Lead ${newLead.name || newLead.full_name || newLead.lead_code || ""} is now assigned to your queue.`;
              const url = newLead.id ? `/admin/leads/${newLead.id}` : "/admin/leads";

              triggerNotification(dedupeKey, title, body, url, "lead");
            }
          },
        )
        // 2. Applications (Orders) Table Events
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "applications" },
          () => {
            invalidateOrdersData();
          }
        )
        .on(
          "postgres_changes" as never,
          { event: "INSERT", schema: "public", table: "applications" },
          (payload: { new?: { id?: string; application_code?: string | null; assigned_to?: string | null } }) => {
            const { isSuperAdmin: isSuper, isManager: isMgr, canSeeOrders: canOrders, rolesLoading } = livePermsRef.current;
            if (rolesLoading || !canOrders) return;

            const app = payload.new ?? {};
            // Managers and operations staff must NEVER receive global notifications for every order coming into the system.
            // Only orders explicitly assigned to them trigger an alert.
            if (isMgr || !isSuper) {
              if (app.assigned_to !== uid) return;
            }

            const dedupeKey = app.id ? `app-${app.id}` : `app-${Date.now()}`;
            const title = "🔔 New Order Received!";
            const body = `Order ${app.application_code || ""} has arrived in the system.`;
            const url = app.id ? `/admin/orders/${app.id}` : "/admin/orders";

            triggerNotification(dedupeKey, title, body, url, "order");
          },
        )
        .on(
          "postgres_changes" as never,
          { event: "UPDATE", schema: "public", table: "applications" },
          (payload: { old?: { assigned_to?: string | null }; new?: { id?: string; application_code?: string | null; assigned_to?: string | null } }) => {
            const { canSeeOrders: canOrders, rolesLoading } = livePermsRef.current;
            if (rolesLoading || !canOrders) return;

            const newApp = payload.new ?? {};
            const oldApp = payload.old ?? {};

            invalidateOrdersData();

            if (newApp.assigned_to === uid && oldApp.assigned_to !== uid) {
              const dedupeKey = newApp.id ? `order-assigned-${newApp.id}` : `order-assigned-${Date.now()}`;
              const title = "🎯 Order Assigned to You";
              const body = `Order ${newApp.application_code || ""} is now assigned to your queue.`;
              const url = newApp.id ? `/admin/orders/${newApp.id}` : "/admin/orders";

              triggerNotification(dedupeKey, title, body, url, "order");
            }
          },
        )
        // 3. Onboarding Submissions
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "onboarding_submissions" },
          () => {
            invalidateLeadsData();
          }
        )
        // 4. Notifications Table (Direct user alerts)
        .on(
          "postgres_changes" as never,
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload: { new?: { id?: string; title?: string | null; body?: string | null; href?: string | null; kind?: string | null; entity_id?: string | null } }) => {
            const notif = payload.new ?? {};
            qc.invalidateQueries({ queryKey: ["notifications"] });
            qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });

            const { canSeeOrders: canOrders, canSeeLeads: canLeads, rolesLoading } = livePermsRef.current;

            if (notif.kind === "order_assigned") {
              if (rolesLoading || !canOrders) return;
              const dedupeKey = notif.entity_id ? `order-assigned-${notif.entity_id}` : `notif-${notif.id}`;
              const title = notif.title || "🎯 Order Assigned to You";
              const body = notif.body || "A new order has been assigned to your queue.";
              const url = notif.href || "/admin/orders";

              triggerNotification(dedupeKey, title, body, url, "order");
            } else if (notif.kind === "lead_assigned" || notif.kind === "new_lead") {
              if (rolesLoading || !canLeads) return;
              const dedupeKey = notif.entity_id ? `lead-assigned-${notif.entity_id}` : `notif-${notif.id}`;
              const title = notif.title || "🎯 Lead Assigned to You";
              const body = notif.body || "A new lead has been assigned to your queue.";
              const url = notif.href || "/admin/leads";

              triggerNotification(dedupeKey, title, body, url, "lead");
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [notify, qc]);

  return { unseen };
}


