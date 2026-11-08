import { Link } from "@tanstack/react-router";
import { NAV_LINKS } from "@/lib/constants";
import { useNav } from "@/lib/websites/site-content-context";

const FALLBACK_NAV = NAV_LINKS.map((l) => ({
  id: `${l.to}-${l.label}`,
  label: l.label,
  path: l.to,
  openInNew: false,
}));

export function Nav() {
  const links = useNav("header", FALLBACK_NAV);
  return (
    <nav className="hidden md:block bg-nav-bg border-b border-border">
      <div className="mx-auto max-w-7xl px-4 bg-[#d2e3f3]">
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-3 text-sm font-medium text-brand-navy">
          {links.map((l) => (
            <li key={l.id}>
              <Link
                to={l.path}
                target={l.openInNew ? "_blank" : undefined}
                activeOptions={{ exact: l.path === "/" }}
                activeProps={{ className: "text-brand-red font-semibold" }}
                className="hover:text-brand-red transition-colors"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
