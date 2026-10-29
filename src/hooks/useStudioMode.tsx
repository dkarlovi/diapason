import { createContext, useCallback, useContext, useState, type PropsWithChildren } from "react";
import { Navigate, useLocation, useNavigate, type NavigateOptions } from "react-router";

function configuration(search: string) {
  const params = new URLSearchParams(search);
  return {
    embedded: params.get("embed") === "1",
    tuneLocked: params.get("embed") === "1" && params.get("tuneEmbed") === "1",
    editAfterRecording: params.get("afterRecording") === "edit",
  };
}
function configurationSearch(mode: ReturnType<typeof configuration>, current = "") {
  const params = new URLSearchParams(current);
  if (mode.embedded) params.set("embed", "1");
  if (mode.tuneLocked) params.set("tuneEmbed", "1");
  if (mode.editAfterRecording) params.set("afterRecording", "edit");
  return params.size ? `?${params}` : "";
}
const StudioMode = createContext<ReturnType<typeof configuration> | null>(null);

/** Keep the entry configuration even when a history entry omits its query. */
export function StudioBoundary({ children }: PropsWithChildren) {
  const location = useLocation();
  const [entry] = useState(() => ({
    ...configuration(location.search),
    pathname: location.pathname,
    hash: location.hash,
  }));
  const tuneEntry =
    entry.embedded && (entry.pathname === "/tune" || entry.hash.startsWith("#tune="));
  const mode = {
    ...entry,
    tuneLocked: entry.tuneLocked || tuneEntry || configuration(location.search).tuneLocked,
  };
  const query = configurationSearch(mode, location.search);
  const pathname =
    mode.embedded &&
    !mode.tuneLocked &&
    location.pathname !== "/tune" &&
    !location.hash.startsWith("#tune=") &&
    location.pathname !== "/new" &&
    !/^\/recording\/[^/]+\/?$/.test(location.pathname)
      ? "/new"
      : location.pathname;
  if (
    mode.tuneLocked &&
    location.pathname !== "/tune" &&
    !/^\/recording\/[^/]+\/?$/.test(location.pathname) &&
    !location.hash.startsWith("#tune=")
  ) {
    return (
      <StudioMode.Provider value={mode}>
        <Navigate
          replace
          to={{ pathname: entry.pathname, search: configurationSearch(mode), hash: entry.hash }}
        />
      </StudioMode.Provider>
    );
  }
  return (
    <StudioMode.Provider value={mode}>
      {pathname !== location.pathname || query !== location.search ? (
        <Navigate replace to={{ pathname, search: query, hash: location.hash }} />
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
  const path = useCallback(
    (pathname: string) => {
      const [name, query = ""] = pathname.split("?");
      const params = new URLSearchParams(search);
      for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
      return name + (params.size ? `?${params}` : "");
    },
    [search],
  );
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
