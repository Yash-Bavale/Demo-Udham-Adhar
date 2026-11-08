import { createFileRoute } from "@tanstack/react-router";

/**
 * One-off maintenance endpoint to bulk-regenerate every invoice PDF using
 * the current renderer (Zoho-style layout). Existing files are upserted
 * in place, replacing any old-format PDF.
 *
 * Auth: must send `Authorization: Bearer <CRON_SECRET>`.
 */
export const Route = createFileRoute("/api/public/admin/regenerate-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const header = request.headers.get("authorization") || "";
        const apikey = request.headers.get("apikey") || "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : apikey;
        if (!secret || token !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows, error } = await supabaseAdmin
          .from("invoices")
          .select("id, payment_id, invoice_number")
          .not("payment_id", "is", null)
          .order("issued_at", { ascending: true });
        if (error) return new Response(error.message, { status: 500 });

        // Lazy-load the generator (which dynamically imports pdf.server.ts).
        const invoicesMod: any = await import("@/lib/crm/invoices.functions");
        const generateAndStore: (paymentId: string, actor?: any) => Promise<string> =
          invoicesMod.__regenerateForMaintenance ?? invoicesMod.generateAndStore;

        const actor = { id: null, label: "maintenance-bulk-regenerate" };
        let regenerated = 0;
        const failed: { id: string; invoice_number: string | null; error: string }[] = [];

        for (const r of rows ?? []) {
          try {
            await generateAndStore(r.payment_id as string, actor);
            regenerated++;
          } catch (e) {
            failed.push({
              id: r.id,
              invoice_number: r.invoice_number ?? null,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return Response.json({
          ok: true,
          total: (rows ?? []).length,
          regenerated,
          failed_count: failed.length,
          failed,
        });
      },
    },
  },
});
