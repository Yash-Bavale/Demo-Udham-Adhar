import { useEffect } from "react";

const scrollPositions = new Map<string, number>();

/**
 * Hook to automatically preserve and restore scroll position for a specific module key.
 * Uses `#admin-main-scroll` as the scroll container.
 *
 * @param key Unique key for the module list (e.g. "admin.orders", "admin.leads")
 * @param isDataReady Boolean indicating if the list data has finished loading (triggers scroll restoration)
 */
export function usePreserveScroll(key: string, isDataReady: boolean = true) {
  // Restore scroll position once data is ready
  useEffect(() => {
    if (!isDataReady) return;
    const container = document.getElementById("admin-main-scroll");
    const savedScrollTop = scrollPositions.get(key);

    if (container && savedScrollTop !== undefined && savedScrollTop > 0) {
      // Use double RAF to ensure DOM layout & table rows are fully rendered
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          if (container) container.scrollTop = savedScrollTop;
        });
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    }
  }, [key, isDataReady]);

  // Continuously record scroll position on the main container
  useEffect(() => {
    const container = document.getElementById("admin-main-scroll");
    if (!container) return;

    const handleScroll = () => {
      scrollPositions.set(key, container.scrollTop);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (container) scrollPositions.set(key, container.scrollTop);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [key]);
}

/** In-memory module filter & pagination state storage */
const moduleStates = new Map<string, Record<string, any>>();

export function saveModuleFilterState(key: string, state: Record<string, any>) {
  moduleStates.set(key, { ...moduleStates.get(key), ...state });
}

export function getModuleFilterState(key: string): Record<string, any> | undefined {
  return moduleStates.get(key);
}

export function clearModuleFilterState(key: string) {
  moduleStates.delete(key);
  scrollPositions.delete(key);
}
