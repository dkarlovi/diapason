import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import { Navigate, useLocation, useNavigate, type NavigateOptions } from "react-router";

function configuration(search: string) {
  const params = new URLSearchParams(search);
  return {
    embedded: params.get("embed") === "1",
    editAfterRecording: params.get("afterRecording") === "edit",
  };
}
function configurationSearch(mode: ReturnType<typeof configuration>, current = "") {
  const params = new URLSearchParams(current);
  if (mode.embedded) params.set("embed", "1");
  if (mode.editAfterRecording) params.set("afterRecording", "edit");
  return params.size ? `?${params}` : "";
}
const StudioMode = createContext<ReturnType<typeof configuration> | null>(null);

/** Keep the entry configuration even when a history entry omits its query. */
export function StudioBoundary({ children }: PropsWithChildren) {
  const location = useLocation();
  const [mode] = useState(() => configuration(location.search));
  const query = configurationSearch(mode, location.search);
  const pathname =
    mode.embedded &&
    location.pathname !== "/new" &&
    !/^\/recording\/[^/]+\/?$/.test(location.pathname)
      ? "/new"
      : location.pathname;
  return (
    <StudioMode.Provider value={mode}>
      {pathname !== location.pathname || query !== location.search ? (
        <Navigate replace to={{ pathname, search: query }} />
      ) : (
        children
      )}
    </StudioMode.Provider>
  );
}

export function useStudioMode() {
  const location = useLocation();
  const inherited = useContext(StudioMode);
  const mode = inherited ?? configuration(location.search);
  const search = configurationSearch(mode);
  const path = useCallback((pathname: string) => pathname + search, [search]);
  return { ...mode, path };
}

export function useStudioNavigate() {
  const navigate = useNavigate();
  const { embedded, path } = useStudioMode();
  return useCallback(
    (pathname: string, options?: NavigateOptions) =>
      navigate(path(embedded && pathname === "/" ? "/new" : pathname), options),
    [navigate, embedded, path],
  );
}
