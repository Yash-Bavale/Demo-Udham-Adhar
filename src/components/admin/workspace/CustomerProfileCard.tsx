import { Link } from "@tanstack/react-router";
import { Phone, Mail, MessageCircle, User2, ExternalLink, Calendar, Tag, MapPin, Languages } from "lucide-react";
import { formatIST } from "@/lib/datetime";
import { CallButton } from "@/components/admin/telephony/CallButton";

interface Props {
  customer: any;
  lead: any;
}

/**
 * Full Customer + Lead profile card for the Customer tab.
 * Shows every contact/lead field we have so staff can read everything in one place.
 */
export function CustomerProfileCard({ customer, lead }: Props) {
  const name = lead?.name ?? customer?.name ?? "—";
  const mobile = lead?.mobile ?? customer?.primary_mobile ?? null;
  const email = lead?.email ?? customer?.primary_email ?? null;
  const waPhone = mobile ? String(mobile).replace(/\D/g, "") : "";
  const waUrl = waPhone ? `https://wa.me/${waPhone.length === 10 ? "91" + waPhone : waPhone}` : null;

  const langCode = (customer?.language ?? lead?.language ?? "en") as string;
  const langLabel = ({ en: "English", hi: "हिन्दी (Hindi)", mr: "मराठी (Marathi)", gu: "ગુજરાતી (Gujarati)", ta: "தமிழ் (Tamil)", te: "తెలుగు (Telugu)", kn: "ಕನ್ನಡ (Kannada)", ml: "മലയാളം (Malayalam)", bn: "বাংলা (Bengali)", pa: "ਪੰਜਾਬੀ (Punjabi)", or: "ଓଡ଼ିଆ (Odia)", ur: "اردو (Urdu)" } as Record<string, string>)[langCode] ?? langCode;

  const fields: Array<{ k: string; v: any; icon?: any }> = [
    { k: "Service", v: lead?.service, icon: Tag },
    { k: "Lead Code", v: lead?.lead_code },
    { k: "Source", v: lead?.lead_source ?? lead?.source },
    { k: "State", v: lead?.state ?? customer?.state, icon: MapPin },
    { k: "City", v: lead?.city },
    { k: "Preferred Language", v: langLabel, icon: Languages },
    { k: "Created", v: lead?.created_at ? formatIST(lead.created_at) : null, icon: Calendar },
    { k: "Lead Status", v: lead?.lead_status_v2 ?? lead?.status },
    { k: "Repeats", v: lead?.repeat_count ? `×${lead.repeat_count}` : null },
    { k: "Notes", v: lead?.notes },
  ];

  return (
    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50/40 to-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white shadow-md shrink-0">
          <User2 className="size-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-slate-900 truncate">{name}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-slate-600">
            {mobile && <span className="font-mono">{mobile}</span>}
            {email && <span className="break-all">{email}</span>}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <CallButton mobile={mobile} customerId={customer?.id ?? null} leadId={lead?.id ?? null} />
            {mobile && (
              <a href={`tel:${mobile}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition">
                <Phone className="size-3.5" /> Call
              </a>
            )}
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition">
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition">
                <Mail className="size-3.5" /> Email
              </a>
            )}
            {customer?.id && (
              <Link to="/admin/customers/$customerId" params={{ customerId: customer.id }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                Full profile <ExternalLink className="size-3.5" />
              </Link>
            )}
            {lead?.id && (
              <Link to="/admin/leads/$leadId" params={{ leadId: lead.id }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition">
                Open Lead <ExternalLink className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 border-t border-slate-100 pt-5">
        {fields.map((f) => {
          const val = f.v;
          if (val === null || val === undefined || val === "") return null;
          const Icon = f.icon;
          return (
            <div key={f.k} className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1">
                {Icon && <Icon className="size-3" />} {f.k}
              </span>
              <span className="text-sm text-slate-800 font-medium mt-0.5 break-words">
                {String(val)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
