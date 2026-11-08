// Canonical role list and permission matrix.
// One source of truth. Never hardcode role lists elsewhere.

export const ROLES = [
  "super_admin",
  "admin",
  "manager",
  "executive",
  "support",
  "accounts",
  "finance",
  // legacy
  "operations",
] as const;

export type Role = (typeof ROLES)[number];

export const ASSIGNABLE_ROLES: Role[] = [
  "super_admin",
  "admin",
  "manager",
  "executive",
  "support",
  "accounts",
  "finance",
];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  executive: "Executive",
  support: "Support",
  accounts: "Accounts",
  finance: "Finance",
  operations: "Operations",
};

export type Access = "full" | "read" | "assigned" | "own" | "finance_tab" | "revenue_only" | "none";

export type Module =
  | "dashboard" | "leads" | "orders" | "payments" | "invoices" | "customers"
  | "documents" | "complaints" | "tickets" | "tasks" | "reports"
  | "employees" | "email_templates" | "audit_log";

export const ALL_MODULES: Module[] = [
  "dashboard", "leads", "orders", "payments", "invoices", "customers",
  "documents", "complaints", "tickets", "tasks", "reports",
  "employees", "email_templates", "audit_log",
];

function fullAll(): Partial<Record<Module, Access>> {
  return Object.fromEntries(ALL_MODULES.map((m) => [m, "full" as Access])) as Partial<Record<Module, Access>>;
}

function onlyModules(map: Partial<Record<Module, Access>>): Partial<Record<Module, Access>> {
  const base: Record<Module, Access> = Object.fromEntries(
    ALL_MODULES.map((m) => [m, "none" as Access]),
  ) as Record<Module, Access>;
  for (const [m, a] of Object.entries(map)) {
    if (a) base[m as Module] = a;
  }
  return base;
}

// Strict role module access matrix.
// Any module not explicitly granted defaults to "none".
export const ACCESS_MATRIX: Record<Role, Partial<Record<Module, Access>>> = {
  super_admin: fullAll(),
  admin: fullAll(),
  manager: onlyModules({
    orders: "full",
  }),
  executive: onlyModules({
    orders: "full",
  }),
  support: onlyModules({
    complaints: "full",
    tickets: "full",
  }),
  accounts: onlyModules({
    payments: "full",
    invoices: "full",
  }),
  finance: onlyModules({
    payments: "full",
    invoices: "full",
    reports: "full",
  }),
  operations: onlyModules({
    orders: "full",
  }),
};

export function bestAccess(roles: string[], module: Module): Access {
  const order: Access[] = ["full", "finance_tab", "revenue_only", "read", "assigned", "own", "none"];
  let best: Access = "none";
  for (const r of roles) {
    const a = ACCESS_MATRIX[r as Role]?.[module] ?? "none";
    if (order.indexOf(a) < order.indexOf(best)) best = a;
  }
  return best;
}

export function canApproveRefund(roles: string[]): boolean {
  return roles.some((r) => r === "super_admin" || r === "admin");
}

export function canSeeModule(roles: string[], module: Module): boolean {
  return bestAccess(roles, module) !== "none";
}

// Single source of truth for financial visibility.
// Operations/support/executive/manager NEVER see money unless they also hold
// a finance/admin role.
const MONEY_ROLES = new Set<string>(["super_admin", "admin", "accounts", "finance"]);
export function canSeeMoney(roles: string[]): boolean {
  return roles.some((r) => MONEY_ROLES.has(r));
}
export function hideMoneyFor(roles: string[]): boolean {
  return !canSeeMoney(roles);
}
