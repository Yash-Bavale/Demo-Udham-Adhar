import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { updateLead } from "@/lib/crm/leads-admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Save, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface LeadEditableCardProps {
  title: string;
  leadId: string;
  data: Record<string, any>;
  fields: { key: string; label: string; type?: string; readOnly?: boolean }[];
  canEdit?: boolean;
}

export function LeadEditableCard({ title, leadId, data, fields, canEdit = true }: LeadEditableCardProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, any>>(data);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const updateFn = useServerFn(updateLead);

  const handleSave = async () => {
    setBusy(true);
    try {
      // Only send changed fields
      const patch: Record<string, any> = {};
      fields.forEach(f => {
        if (!f.readOnly && values[f.key] !== data[f.key]) {
          patch[f.key] = values[f.key];
        }
      });

      if (Object.keys(patch).length > 0) {
        await updateFn({ data: { id: leadId, ...patch } });
        toast.success("Updated successfully");
        qc.invalidateQueries({ queryKey: ["admin.lead", leadId] });
      }
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="h-7 text-xs gap-1">
            <Pencil className="w-3 h-3" /> Edit
          </Button>
        )}
        {editing && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setValues(data); }} className="h-7 text-xs text-slate-500">
              <X className="w-3 h-3" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy} className="h-7 text-xs gap-1 bg-slate-900">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </Button>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1 border-b last:border-0 pb-2 last:pb-0">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">{f.label}</span>
            {editing && !f.readOnly ? (
              <Input
                type={f.type || "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                className="h-8 text-sm"
              />
            ) : (
              <span className="text-sm font-medium text-slate-900 truncate">
                {f.type === 'number' ? `₹${Number(data[f.key] || 0).toFixed(2)}` : (data[f.key] || "—")}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
