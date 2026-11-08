// Cashfree PG helpers — server-only.
// Uses Cashfree REST API v2023-08-01 with redirect-based checkout.
// Sandbox: https://sandbox.cashfree.com/pg
// Production: https://api.cashfree.com/pg

import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Environment & credentials
// ---------------------------------------------------------------------------

const CASHFREE_API_VERSION = "2023-08-01";

/** @deprecated Global resolver kept for reference only. Use cashfree-accounts.server (credsForWebsite / credsForPayment). */
export async function getCashfreeCreds() {
  let clientId = process.env.CASHFREE_CLIENT_ID;
  let clientSecret = process.env.CASHFREE_CLIENT_SECRET;
  let mode = String(process.env.CASHFREE_MODE ?? "").trim().toLowerCase();

  if (!clientId || !clientSecret) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: gw } = await supabaseAdmin
        .from("payment_gateways")
        .select("config")
        .ilike("name", "%cashfree%")
        .maybeSingle();

      const cfg = (gw?.config as Record<string, any>) || {};
      clientId = (clientId || cfg.client_id || cfg.clientId || cfg.app_id || cfg.appId || "").trim();
      clientSecret = (clientSecret || cfg.client_secret || cfg.clientSecret || cfg.secret_key || cfg.secretKey || "").trim();
      mode = mode || String(cfg.mode || cfg.environment || "").trim().toLowerCase();
    } catch {
      /* ignore DB lookup error */
    }
  } else {
    clientId = clientId.trim();
    clientSecret = clientSecret.trim();
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET in environment variables or DB config.",
    );
  }

  let isProd = mode === "production" || mode === "live" || mode === "prod";
  if (!mode) {
    if (clientId.toUpperCase().startsWith("TEST") || clientSecret.toLowerCase().includes("test")) {
      isProd = false;
    } else {
      isProd = true;
    }
  }

  const apiUrl = isProd ? "https://api.cashfree.com/pg" : "https://sandbox.cashfree.com/pg";

  return { clientId, clientSecret, isProd, apiUrl };
}

// ---------------------------------------------------------------------------
// Create Order — POST /pg/orders
// ---------------------------------------------------------------------------

export interface CashfreeCreateOrderParams {
  orderId: string;
  orderAmount: number;
  orderCurrency?: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  customerName?: string;
  returnUrl: string;
  notifyUrl?: string;
}

export interface CashfreeOrderResponse {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  order_token?: string;
  payment_session_id: string;
  order_amount: number;
  payment_link?: string;
  payments?: { url?: string };
}

type ExplicitCreds = { clientId: string; clientSecret: string; apiUrl: string };

export async function createCashfreeOrder(
  params: CashfreeCreateOrderParams,
  creds: ExplicitCreds,
): Promise<CashfreeOrderResponse> {
  const { clientId, clientSecret, apiUrl } = creds;

  const body = {
    order_id: params.orderId,
    order_amount: params.orderAmount,
    order_currency: params.orderCurrency || "INR",
    customer_details: {
      customer_id: params.customerId,
      customer_email: params.customerEmail,
      customer_phone: params.customerPhone,
      customer_name: params.customerName || params.customerEmail,
    },
    order_meta: {
      return_url: params.returnUrl,
      ...(params.notifyUrl ? { notify_url: params.notifyUrl } : {}),
    },
  };

  const res = await fetch(`${apiUrl}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-version": CASHFREE_API_VERSION,
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[cashfree] createOrder failed", { status: res.status, body: text });
    throw new Error(`Cashfree order creation failed (HTTP ${res.status}): ${text}`);
  }

  return (await res.json()) as CashfreeOrderResponse;
}

// ---------------------------------------------------------------------------
// Get Order Status — GET /pg/orders/{order_id}
// ---------------------------------------------------------------------------

export interface CashfreeOrderStatusResponse {
  cf_order_id: string;
  order_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
  payment_session_id?: string;
  order_note?: string;
}

export async function getOrderStatus(
  orderId: string,
  creds: ExplicitCreds,
): Promise<CashfreeOrderStatusResponse> {
  const { clientId, clientSecret, apiUrl } = creds;

  const res = await fetch(`${apiUrl}/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-api-version": CASHFREE_API_VERSION,
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cashfree order status check failed (HTTP ${res.status}): ${text}`);
  }

  return (await res.json()) as CashfreeOrderStatusResponse;
}

// ---------------------------------------------------------------------------
// Webhook Signature Verification
// ---------------------------------------------------------------------------

/**
 * Verify Cashfree webhook signature.
 * Cashfree signs: HMAC-SHA256(timestamp + rawBody, clientSecret) → base64.
 */
export async function verifyWebhookSignature(
  timestamp: string,
  rawBody: string,
  receivedSignature: string,
  clientSecret: string,
): Promise<boolean> {
  const data = timestamp + rawBody;
  const computed = createHmac("sha256", clientSecret).update(data).digest("base64");
  return computed === receivedSignature;
}

// ---------------------------------------------------------------------------
// Build unique order ID for Cashfree
// ---------------------------------------------------------------------------

export function buildCashfreeOrderId(leadCode: string): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `CF-${leadCode}-${ts}-${rnd}`.toUpperCase();
}
