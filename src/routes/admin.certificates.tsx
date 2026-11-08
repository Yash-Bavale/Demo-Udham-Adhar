import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listCertificates, uploadCertificate, deliverCertificate, getCertificateUrl } from "@/lib/crm/certificates.functions";
import { resendOrderCertificate } from "@/lib/crm/orders-v2.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Award, Upload, Send, Eye, Loader2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/certificates")({
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/admin-login" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "super_admin"]);
    if (!data || data.length === 0) throw redirect({ to: "/admin/my-work" });
  },
  component: CertificatesPage,
});

function CertificatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCertificates);
  const uploadFn = useServerFn(uploadCertificate);
  const deliverFn = useServerFn(deliverCertificate);
  const urlFn = useServerFn(getCertificateUrl);
  const resendFn = useServerFn(resendOrderCertificate);

  const [filter, setFilter] = useState<"all" | "yes" | "no">("all");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin.certificates", filter, search],
    queryFn: () => listFn({ data: { delivered: filter, search: search || undefined } }),
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [appId, setAppId] = useState("");
  const [certNumber, setCertNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const handleUpload = async () => {
    if (!file || !appId) { toast.error("Application ID and file required"); return; }
    setBusy(true);
    try {
      const arr = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)));
      await uploadFn({ data: { applicationId: appId, fileBase64: b64, fileName: file.name, mimeType: file.type || "application/pdf", certificateNumber: certNumber || undefined } });
      toast.success("Certificate uploaded");
      setUploadOpen(false); setFile(null); setAppId(""); setCertNumber("");
      qc.invalidateQueries({ queryKey: ["admin.certificates"] });
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
    finally { setBusy(false); }
  };

  const handleDeliver = async (id: string) => {
    const ccInput = window.prompt("Optional: Enter CC email address (leave blank to send only to registered email):");
    if (ccInput === null) return;
    const ccEmail = ccInput.trim() || undefined;
    try {
      await deliverFn({ data: { certificateId: id, ccEmail } });
      toast.success("Delivered & emailed");
      qc.invalidateQueries({ queryKey: ["admin.certificates"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handlePreview = async (id: string) => {
    try {
      const { url } = await urlFn({ data: { certificateId: id } });
      if (url) window.open(url, "_blank", "noopener");
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  };

  const handleResend = async (applicationId: string | null | undefined) => {
    if (!applicationId) { toast.error("This certificate is not linked to an order."); return; }
    const ccInput = window.prompt("Optional: Enter CC email address (leave blank to send only to registered email):");
    if (ccInput === null) return;
    const ccEmail = ccInput.trim() || undefined;
    try {
      const res = await resendFn({ data: { orderId: applicationId, ccEmail } });
      toast.success(`Certificate resent to ${res.resentTo}`);
      qc.invalidateQueries({ queryKey: ["admin.certificates"] });
    } catch (e: any) { toast.error(e?.message ?? "Resend failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Award className="w-6 h-6" /> Certificates</h1>
          <p className="text-sm text-slate-500 mt-1">Upload Udyam certificates and deliver to customers.</p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Upload className="w-4 h-4" /> Upload Certificate</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload New Certificate</DialogTitle></DialogHeader>
            <div className="space-y-3 py-3">
              <div>
                <label className="text-xs font-medium uppercase text-slate-500">Application ID (UUID)</label>
                <Input value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="Paste application UUID from list" />
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-slate-500">Certificate Number (optional)</label>
                <Input value={certNumber} onChange={(e) => setCertNumber(e.target.value)} placeholder="UDYAM-XX-00-0000000" />
              </div>
              <div>
                <label className="text-xs font-medium uppercase text-slate-500">PDF File</label>
                <Input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={busy}>Cancel</Button>
              <Button onClick={handleUpload} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Upload</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="py-3 border-b bg-slate-50/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-sm font-semibold">All Certificates ({data?.rows.length ?? 0})</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 w-48" />
              </div>
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="h-8 rounded-md border px-2 text-xs">
                <option value="all">All</option><option value="no">Pending Delivery</option><option value="yes">Delivered</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> :
          data?.rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400 italic">No certificates yet. Upload your first one above.</div> :
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left py-2 px-4">Number</th>
                <th className="text-left">Customer</th>
                <th className="text-left">Application</th>
                <th className="text-left">Issued</th>
                <th className="text-left">Status</th>
                <th className="text-right py-2 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.rows.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-xs">{c.certificate_number || "—"}</td>
                  <td>{c.lead ? <Link to="/admin/leads/$leadId" params={{ leadId: c.lead.id }} className="hover:underline">{c.lead.name}</Link> : "—"}</td>
                  <td className="text-xs font-mono">{c.application?.application_code || "—"}</td>
                  <td className="text-xs text-slate-500">{c.issued_at ? new Date(c.issued_at).toLocaleDateString("en-IN") : "—"}</td>
                  <td>{c.delivered_at
                    ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Delivered</Badge>
                    : <Badge variant="outline" className="text-amber-600">Pending</Badge>}</td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handlePreview(c.id)}><Eye className="w-3 h-3 mr-1" />View</Button>
                    {!c.delivered_at && <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-600" onClick={() => handleDeliver(c.id)}><Send className="w-3 h-3 mr-1" />Deliver</Button>}
                    {c.delivered_at && c.application_id && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600" onClick={() => handleResend(c.application_id)}>
                        <RefreshCw className="w-3 h-3 mr-1" />Resend
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
        </CardContent>
      </Card>
    </div>
  );
}
