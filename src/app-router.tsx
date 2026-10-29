import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useParams,
  type RouteObject,
} from "react-router";
import { AppShell } from "./components/AppShell";
import { Library } from "./components/Library";
import { Capture } from "./components/Capture";
import { Editor } from "./components/Editor";
import { AdHocTuneRoute } from "./components/AdHocTuneRoute";
import { StudioBoundary } from "./hooks/useStudioMode";
import { BASE } from "./router";
function RecordingRoute() {
  const { id } = useParams();
  return id ? <Editor key={id} id={id} /> : <Library />;
}
function EntryRoute() {
  const location = useLocation();
  return location.hash.startsWith("#tune=") ? (
    <Navigate replace to={{ pathname: "/tune", search: location.search, hash: location.hash }} />
  ) : (
    <Library />
  );
}
export const appRoutes: RouteObject[] = [
  {
    element: (
      <StudioBoundary>
        <AppShell>
          <Outlet />
        </AppShell>
      </StudioBoundary>
    ),
    children: [
      { path: "/", element: <EntryRoute /> },
      { path: "/tune", element: <AdHocTuneRoute /> },
      { path: "/new", element: <Capture /> },
      { path: "/recording/:id", element: <RecordingRoute /> },
      { path: "*", element: <EntryRoute /> },
    ],
  },
];
export const createAppRouter = () => createBrowserRouter(appRoutes, { basename: BASE });
