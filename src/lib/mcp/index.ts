import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchLeads from "./tools/search-leads";
import getLead from "./tools/get-lead";
import listOrders from "./tools/list-orders";
import getOrder from "./tools/get-order";
import addLeadNote from "./tools/add-lead-note";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "udyam-ops-mcp",
  title: "Udyam Ops CRM",
  version: "0.1.0",
  instructions:
    "Tools for the Udyam Ops CRM. Search and read leads and orders, and append internal notes to a lead. All access runs as the signed-in staff user and respects their permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchLeads, getLead, listOrders, getOrder, addLeadNote],
});
