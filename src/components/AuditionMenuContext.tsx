import { createContext } from "react";

/** A hidden mobile toolbox closes its portals without forgetting the comparison menu. */
export const AuditionMenuContext = createContext<{
  visible: boolean;
  menu: string | null;
  setMenu(label: string | null): void;
} | null>(null);
