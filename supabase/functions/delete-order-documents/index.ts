// Service-role edge function: permanently delete documents for an application
// (skipping certificates) after a refund is processed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Auth: this function performs an irreversible destructive operation using the
  // service role key. Only trusted server-side callers (server functions invoking
  // via admin.functions.invoke, which forwards the service role bearer, or a
  // pg_cron/internal call presenting CRON_SECRET) may run it. Reject everyone else.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const apikey = req.headers.get("apikey") ?? "";
  const authorized =
    (!!serviceKey && (bearer === serviceKey || apikey === serviceKey)) ||
    (!!cronSecret && (bearer === cronSecret || apikey === cronSecret));
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  let payload: { application_id?: string; reason?: string; keep_document_id?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const applicationId = payload.application_id;
  const reason = payload.reason ?? "refund";
  const keepDocumentId = payload.keep_document_id ?? null;
  if (!applicationId) return new Response("application_id required", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // 1. List documents (certificates live in a separate `certificates` table).
  const { data: docs, error: listErr } = await supabase
    .from("documents")
    .select("id, file_path, doc_type")
    .eq("application_id", applicationId);
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const toDelete = (docs ?? []).filter((d: any) => {
    if (keepDocumentId && d.id === keepDocumentId) return false;
    if (String(d.doc_type ?? "").toLowerCase() === "certificate") return false;
    return true;
  });
  const paths = toDelete.map((d: any) => d.file_path).filter(Boolean);
  const ids = toDelete.map((d: any) => d.id);

  // 2. Remove from storage.
  let storageDeleted = 0;
  if (paths.length > 0) {
    const { data: rm, error: rmErr } = await supabase.storage.from("documents").remove(paths);
    if (rmErr) console.error("storage remove failed:", rmErr.message);
    storageDeleted = rm?.length ?? 0;
  }

  // 3. Delete document rows.
  let rowsDeleted = 0;
  if (ids.length > 0) {
    const { error: delErr } = await supabase.from("documents").delete().in("id", ids);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
    rowsDeleted = ids.length;
  }

  // 4. Stamp application.
  await supabase
    .from("applications")
    .update({
      documents_deleted_at: new Date().toISOString(),
      documents_deleted_reason: reason,
    })
    .eq("id", applicationId);

  return new Response(
    JSON.stringify({ ok: true, storage_deleted: storageDeleted, rows_deleted: rowsDeleted, reason }),
    { headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } }
  );
});
