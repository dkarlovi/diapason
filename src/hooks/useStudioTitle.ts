import { createContext, useContext, useEffect } from "react";

export const StudioTitleContext = createContext<((title: string) => void) | null>(null);

export function useStudioTitle(title: string) {
  const setTitle = useContext(StudioTitleContext);
  useEffect(() => {
    setTitle?.(title);
    return () => setTitle?.("");
  }, [setTitle, title]);
}
