// CCAvenue helpers — server-only.
// Reference: CCAvenue Web Integration Kit (Non-Seamless / iFrame).
//
// Request flow:
//   1. Build pipe-delimited key=value query string.
//   2. AES-128-CBC encrypt with MD5(workingKey) and a fixed 16-byte IV (0x00..0x0f).
//   3. Hex-encode and POST as `encRequest` to /transaction/transaction.do.
//
// Response flow:
//   - CCAvenue POSTs `encResp` (hex). Decrypt the same way to recover the
//     pipe-delimited key=value payload.
//
// Status/Refund API uses the DoWebTrans servlet with the same crypto scheme,
// wrapped in an additional enc_request= / command= / access_code= form body.

import { createCipheriv, createDecipheriv, createHash, randomUUID } from "crypto";

function ccavEnv(): "live" | "test" {
  const v = (process.env.CCAV_ENV ?? "live").trim().toLowerCase();
  return v === "test" ? "test" : "live";
}

export const CCAV_REDIRECT_URL =
  ccavEnv() === "test"
    ? "https://test.ccavenue.com/transaction/transaction.do?command=initiateTransaction"
    : "https://secure.ccavenue.com/transaction/transaction.do?command=initiateTransaction";

export const CCAV_API_URL =
  ccavEnv() === "test"
    ? "https://apitest.ccavenue.com/apis/servlet/DoWebTrans"
    : "https://api.ccavenue.com/apis/servlet/DoWebTrans";

// CCAvenue ships a fixed IV in their reference kits:
const CCAV_IV = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
]);

export type CcavCreds = {
  merchantId: string;
  accessCode: string;
  workingKey: string;
};

export function getCcavCreds(): CcavCreds {
  const merchantId = (process.env.CCAV_MERCHANT_ID ?? "").trim();
  const accessCode = (process.env.CCAV_ACCESS_CODE ?? "").trim();
  const workingKey = (process.env.CCAV_WORKING_KEY ?? "").trim();
  if (!merchantId || !accessCode || !workingKey) {
    throw new Error(
      "CCAvenue is not configured. Set CCAV_MERCHANT_ID, CCAV_ACCESS_CODE and CCAV_WORKING_KEY (no surrounding whitespace).",
    );
  }
  return { merchantId, accessCode, workingKey };
}

// ── Crypto ───────────────────────────────────────────────────────────────

function deriveKey(workingKey: string): Buffer {
  return createHash("md5").update(workingKey).digest();
}

export function encryptRequest(plaintext: string, workingKey: string): string {
  const cipher = createCipheriv("aes-128-cbc", deriveKey(workingKey), CCAV_IV);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return enc.toString("hex");
}

export function decryptResponse(cipherHex: string, workingKey: string): string {
  const decipher = createDecipheriv("aes-128-cbc", deriveKey(workingKey), CCAV_IV);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

// CCAvenue payloads are key=value&key=value, URI-encoded. Values may contain
// embedded '=' or '&' if the merchant sent them — we split conservatively.
export function parseCcavPayload(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of payload.split("&")) {
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx < 0) {
      out[decodeURIComponent(pair)] = "";
      continue;
    }
    const k = decodeURIComponent(pair.slice(0, idx));
    const v = decodeURIComponent(pair.slice(idx + 1));
    out[k] = v;
  }
  return out;
}

export function buildCcavPayload(params: Record<string, string | number | undefined | null>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

// ── Order id ─────────────────────────────────────────────────────────────

export function buildCcavOrderId(leadCode: string): string {
  const ts = Date.now().toString(36);
  const rnd = randomUUID().slice(0, 6);
  return `CCAV-${leadCode}-${ts}-${rnd}`.toUpperCase().slice(0, 50);
}

// ── Status normalization ─────────────────────────────────────────────────

/**
 * Map a CCAvenue order_status / status into our payment_status enum.
 * CCAvenue values (Web integration): "Success", "Aborted", "Failure",
 * "Invalid", "Awaited", "Initiated", "Auto-Cancelled", "Timeout",
 * "Shipped", "Refunded".
 */
export function normalizeCcavStatus(raw: unknown): "paid" | "failed" | "attempted" | "created" | "refunded" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "success" || v === "successful" || v === "shipped") return "paid";
  if (v === "refunded") return "refunded";
  if (
    v === "aborted" ||
    v === "failure" ||
    v === "failed" ||
    v === "invalid" ||
    v === "auto-cancelled" ||
    v === "timeout" ||
    v === "cancelled"
  ) {
    return "failed";
  }
  if (v === "awaited" || v === "initiated" || v === "pending") return "attempted";
  return "created";
}

// ── DoWebTrans API (Status / Refund) ─────────────────────────────────────

type DoWebTransOptions = {
  command: "orderStatusTracker" | "refundOrder";
  payload: Record<string, string | number>;
};

/**
 * Generic DoWebTrans caller. Encrypts payload, posts to CCAvenue, decrypts
 * and parses the response into a key/value record.
 */
async function callDoWebTrans({ command, payload }: DoWebTransOptions): Promise<{
  ok: boolean;
  status: number;
  body: Record<string, string>;
  raw: string;
}> {
  const { accessCode, workingKey } = getCcavCreds();
  // DoWebTrans runs in request_type=JSON mode: the encrypted payload must be a
  // JSON object, not the pipe/form style used by the checkout request.
  const enc = encryptRequest(JSON.stringify(payload), workingKey);
  const body = new URLSearchParams({
    enc_request: enc,
    access_code: accessCode,
    command,
    request_type: "JSON",
    response_type: "JSON",
    version: "1.2",
  });

  const res = await fetch(CCAV_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  // CCAvenue replies as `status=N&enc_response=...` (URL-encoded).
  const outer = parseCcavPayload(text);
  const encResponse = (outer.enc_response || outer.encResponse || "").trim();
  if (!encResponse) {
    return { ok: false, status: res.status, body: outer, raw: text };
  }
  // On gate errors (e.g. 51407 access blocked / IP not whitelisted) CCAvenue
  // returns a plaintext message in enc_response instead of hex ciphertext.
  if (!/^[0-9a-fA-F]+$/.test(encResponse) || encResponse.length % 32 !== 0) {
    return {
      ok: false,
      status: res.status,
      body: {
        error_code: outer.enc_error_code || "api_error",
        error_desc: encResponse,
      },
      raw: text,
    };
  }
  let decrypted: string;
  try {
    decrypted = decryptResponse(encResponse, workingKey);
  } catch {
    return {
      ok: false,
      status: res.status,
      body: { error_code: "decrypt_failed", error_desc: "Could not decrypt the CCAvenue response (working key mismatch)." },
      raw: text,
    };
  }

  // The inner payload is typically JSON for DoWebTrans, but older accounts
  // still return key=value form. Try JSON first, fall back to form parse.
  let inner: Record<string, string> = {};
  try {
    const obj = JSON.parse(decrypted);
    // CCAvenue wraps results in arrays like { Order_Status_Result: [{...}] }
    inner = flattenJsonResult(obj);
  } catch {
    inner = parseCcavPayload(decrypted);
  }
  return { ok: res.ok, status: res.status, body: inner, raw: decrypted };
}

function flattenJsonResult(obj: unknown): Record<string, string> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, string> = {};
  const walk = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (val && typeof val === "object") walk(val);
        else if (val !== undefined && val !== null) out[k] = String(val);
      }
    }
  };
  walk(obj);
  return out;
}

export type CcavStatusResult = {
  status: "paid" | "failed" | "attempted" | "created" | "refunded";
  orderNo: string;
  amount: string | null;
  trackingId: string | null;
  bankRefNo: string | null;
  raw: Record<string, string>;
};

export async function callOrderStatusApi(orderNo: string): Promise<CcavStatusResult> {
  const result = await callDoWebTrans({
    command: "orderStatusTracker",
    payload: { order_no: orderNo },
  });

  const r = result.body;
  // Error replies look like { error_desc, error_code, status: 1 } — never treat
  // the numeric envelope `status` as an order status.
  const orderStatus = r.error_code
    ? ""
    : r.order_status || r.Order_Status || "";
  return {
    status: normalizeCcavStatus(orderStatus),
    orderNo: r.order_no || r.order_id || orderNo,
    amount: r.order_amt || r.amount || null,
    trackingId: r.reference_no || r.tracking_id || null,
    bankRefNo: r.order_bank_ref_no || r.bank_ref_no || null,
    raw: r,
  };
}

export type CcavRefundResult = {
  ok: boolean;
  refundStatus: string;
  refundRef: string | null;
  reason: string | null;
  raw: Record<string, string>;
};

export async function callRefundApi(args: {
  refNo: string;          // CCAvenue reference_no (tracking id)
  refundAmount: number;
  refundRef: string;      // our idempotency reference
}): Promise<CcavRefundResult> {
  const result = await callDoWebTrans({
    command: "refundOrder",
    payload: {
      reference_no: args.refNo,
      refund_amount: args.refundAmount.toFixed(2),
      refund_ref_no: args.refundRef,
    },
  });
  const r = result.body;
  if (r.error_code) {
    return {
      ok: false,
      refundStatus: r.error_code,
      refundRef: args.refundRef,
      reason: r.error_desc || null,
      raw: r,
    };
  }
  // CCAvenue refund_status: "0" = success, anything else = failure.
  const refundStatus = r.refund_status || r.RefundStatus || "";
  const ok = refundStatus === "0" || refundStatus.toLowerCase() === "success";
  return {
    ok,
    refundStatus,
    refundRef: r.reference_no || args.refundRef || null,
    reason: r.reason || r.error_desc || r.reason_desc || null,
    raw: r,
  };
}
