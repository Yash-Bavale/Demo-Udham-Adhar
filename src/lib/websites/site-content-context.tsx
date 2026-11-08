import { createContext, useContext, type ReactNode } from "react";
import type { SiteContent, NavItem, JsonValue } from "./site-content.functions";

const EMPTY: SiteContent = { websiteId: "", headerNav: [], footerNav: [], blocks: {} };

const SiteContentContext = createContext<SiteContent>(EMPTY);

export function SiteContentProvider({
  value,
  children,
}: {
  value: SiteContent | null | undefined;
  children: ReactNode;
}) {
  return (
    <SiteContentContext.Provider value={value ?? EMPTY}>
      {children}
    </SiteContentContext.Provider>
  );
}

export function useSiteContent(): SiteContent {
  return useContext(SiteContentContext);
}

/** Nav list with a code fallback so a new/unseeded domain is never empty. */
export function useNav(group: "header" | "footer", fallback: NavItem[]): NavItem[] {
  const content = useSiteContent();
  const list = group === "header" ? content.headerNav : content.footerNav;
  return list.length ? list : fallback;
}

/** Read a content block, falling back to a code default when unset. */
export function useBlock<T>(key: string, fallback: T): T {
  const { blocks } = useSiteContent();
  const raw = blocks[key];
  return (raw === undefined || raw === null ? fallback : (raw as unknown as T));
}

/** Read `content.items` from a list-style block. */
export function useBlockItems<T>(key: string, fallback: T[]): T[] {
  const block = useBlock<{ items?: T[] } | null>(key, null);
  const items = block?.items;
  return Array.isArray(items) && items.length ? items : fallback;
}

export type { SiteContent, NavItem, JsonValue };
