import { isVisibleService } from "@/lib/crm/visible-services";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw, ArrowRightLeft, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { changeLeadService } from "@/lib/crm/leads-admin.functions";
import { listServices } from "@/lib/crm/services-admin.functions";

type ServiceRow = {
  id: string;
  service_code: string;
  service_name: string;
  base_amount: number;
  gst_amount: number;
  total_amount: number;
  is_active: boolean;
};

export function ChangeServiceDialog({
  leadId,
  currentService,
  currentAmount,
  disabled = false,
}: {
  leadId: string;
  currentService?: string | null;
  currentAmount?: number | string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const qc = useQueryClient();

  const getServicesFn = useServerFn(listServices);
  const changeServiceFn = useServerFn(changeLeadService);

  const { data: servicesData, isLoading: isLoadingServices } = useQuery({
    queryKey: ["admin.services.active"],
    queryFn: () => getServicesFn(),
    enabled: open,
  });

  const GST_DOMAIN = "gstcertificate.in";
  const activeServices = (servicesData?.rows ?? []).filter(
    (s: ServiceRow & { website?: { domain?: string } }) =>
      isVisibleService(s)
  );

  const selectedService = activeServices.find((s: ServiceRow) => s.id === selectedServiceId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedServiceId) throw new Error("Please select a service");
      return changeServiceFn({
        data: {
          leadId,
          serviceId: selectedServiceId,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Service changed to ${res.serviceName}! New payment link generated.`);
      qc.invalidateQueries({ queryKey: ["admin.lead", leadId] });
      qc.invalidateQueries({ queryKey: ["admin.order"] });
      qc.invalidateQueries({ queryKey: ["admin.formSubmission"] });
      qc.invalidateQueries({ queryKey: ["admin.orders.v2"] });
      qc.invalidateQueries({ queryKey: ["admin.lead.workspace"] });
      qc.invalidateQueries({ queryKey: ["payment-link-status", leadId] });
      qc.invalidateQueries({ queryKey: ["admin.lead-events", leadId] });
      qc.invalidateQueries({ queryKey: ["admin.lead-contact-events", leadId] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to change service");
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="gap-1.5 border-indigo-200 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 font-medium shadow-xs text-xs"
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        Change Service
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
              Change Customer Service
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Update the service for this lead. This will instantly update Lead details, linked Applications/Orders, DB records, and generate a new payment link with the new price.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-slate-50 border p-3 text-xs space-y-1">
              <div className="text-slate-500 font-medium">Current Service</div>
              <div className="font-semibold text-slate-800 flex justify-between items-center">
                <span>{currentService || "Not set"}</span>
                {currentAmount != null && (
                  <span className="font-mono text-slate-600">₹{Number(currentAmount)}</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Select New Service</Label>
              {isLoadingServices ? (
                <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading services catalog…
                </div>
              ) : activeServices.length === 0 ? (
                <div className="text-xs text-amber-600 py-2 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> No active services found in database.
                </div>
              ) : (
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="">-- Choose a service --</option>
                  {activeServices.map((s: ServiceRow) => (
                    <option key={s.id} value={s.id}>
                      {s.service_name} — ₹{s.total_amount}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedService && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-xs space-y-1.5">
                <div className="font-semibold text-indigo-900 flex justify-between">
                  <span>Selected: {selectedService.service_name}</span>
                  <span className="font-mono text-indigo-700">₹{selectedService.total_amount}</span>
                </div>
                <div className="text-[11px] text-slate-500 grid grid-cols-3 gap-1 pt-1 border-t border-indigo-100/60">
                  <div>Base: ₹{selectedService.base_amount}</div>
                  <div>GST (18%): ₹{selectedService.gst_amount}</div>
                  <div className="font-bold text-slate-700">Total: ₹{selectedService.total_amount}</div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedServiceId || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              {mutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Updating…
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Confirm & Change Service
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
