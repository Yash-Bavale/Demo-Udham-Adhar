import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { auditOrderPayments } from "@/lib/payments/payment-audit.functions";

export const Route = createFileRoute("/admin/payment-audit")({ component: PaymentAuditPage });

const SEVERITY_STYLES: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

const VERDICT_LABEL: Record<string, string> = {
  clean: "No mismatches found",
  review: "Needs review",
  mismatch: "Mismatches found",
};

import { useFinancialVisibility } from "@/hooks/useFinancialVisibility";

function fmtDate(s: string | null) {
  return s ? new Date(s).toLocaleString("en-IN") : "—";
}

function PaymentAuditPage() {
  const { formatINR } = useFinancialVisibility();
  const auditFn = useServerFn(auditOrderPayments);
  const [code, setCode] = useState("");

  const audit = useMutation({
    mutationFn: (c: string) => auditFn({ data: { code: c } }),
  });

  const result = audit.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Payment Audit</h1>
        <p className="text-sm text-slate-500 mt-1">
          End-to-end reconciliation for one order: gateway references, payment links, invoices, lead status
          transitions and email sends. Read-only — nothing is modified.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) audit.mutate(code.trim());
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="AP-2026-008007 or UA-2026-013731"
          className="w-80 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={audit.isPending || !code.trim()}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {audit.isPending ? "Auditing…" : "Run audit"}
        </button>
      </form>

      {audit.isError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(audit.error as Error).message}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              result.verdict === "clean"
                ? SEVERITY_STYLES["ok"]
                : result.verdict === "review"
                  ? SEVERITY_STYLES["warn"]
                  : SEVERITY_STYLES["error"]
            }`}
          >
            <div className="font-semibold">
              {result.code} — {VERDICT_LABEL[result.verdict] ?? result.verdict}
            </div>
            <div className="mt-1">
              {result.errors} error(s) · {result.warnings} warning(s) · Paid {formatINR(result.totals.paid)} · Invoiced{" "}
              {formatINR(result.totals.invoiced)}
              {Math.abs(result.totals.delta) > 0.5 ? ` · Δ ${formatINR(result.totals.delta)}` : ""}
            </div>
            {result.lead && (
              <div className="mt-1 text-xs opacity-80">
                Lead {result.lead.code} · {result.lead.name ?? "—"} · {result.lead.email ?? "—"} · status{" "}
                {result.lead.status ?? "—"}
              </div>
            )}
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">Checks</h2>
            {result.checks.map((c) => (
              <div key={c.id} className={`rounded border px-3 py-2 text-sm ${SEVERITY_STYLES[c.severity]}`}>
                <span className="font-medium">{c.label}:</span> {c.detail}
              </div>
            ))}
          </section>

          <Section title={`Payments (${result.payments.length})`}>
            <Table
              head={["When", "Amount", "Status", "Gateway", "Reference", "Type", "Invoice"]}
              rows={result.payments.map((p) => [
                fmtDate(p.at),
                formatINR(p.amount, { maximumFractionDigits: 2 }),
                p.status,
                p.gateway ?? "—",
                p.reference ?? "—",
                p.isTopUp ? "Top-up" : "Primary",
                p.invoice ?? "—",
              ])}
            />
          </Section>

          <Section title={`Payment links (${result.links.length})`}>
            <Table
              head={["Created", "Txn ID", "Amount", "Status"]}
              rows={result.links.map((l) => [fmtDate(l.createdAt), l.txnid, formatINR(l.amount, { maximumFractionDigits: 2 }), l.status])}
            />
          </Section>

          <Section title={`Invoices (${result.invoices.length})`}>
            <Table
              head={["Issued", "Number", "Total", "Emailed"]}
              rows={result.invoices.map((i) => [
                fmtDate(i.issuedAt),
                i.number ?? "—",
                formatINR(i.total, { maximumFractionDigits: 2 }),
                fmtDate(i.emailedAt),
              ])}
            />
          </Section>

          <Section title={`Status transitions (${result.transitions.length})`}>
            <Table
              head={["When", "From", "To", "Reason"]}
              rows={result.transitions.map((t) => [fmtDate(t.at), t.from ?? "—", t.to, t.reason ?? "—"])}
            />
          </Section>

          <Section title={`Emails (${result.emails.length})`}>
            <Table
              head={["Sent", "Template", "To", "Subject", "Status"]}
              rows={result.emails.map((e) => [fmtDate(e.at), e.code ?? "—", e.to, e.subject, e.status])}
            />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  if (rows.length === 0) return <div className="text-xs text-slate-500">None</div>;
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
