import * as React from "react";

const LG_BREAKPOINT = 1024;

export function useIsLg() {
  return React.useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    () => window.innerWidth >= LG_BREAKPOINT,
    () => false,
  );
}
