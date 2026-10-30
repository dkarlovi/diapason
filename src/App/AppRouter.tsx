import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  useParams,
  type RouteObject,
} from "react-router";
import { AppShell } from "./AppShell";
import { Library } from "../Features/Library/Library";
import { Capture } from "../Features/Capture/Capture";
import { Editor } from "../Features/Editor/Editor";
import { AdHocTuneRoute } from "../Features/Editor/AdHocTuneRoute";
import { StudioBoundary } from "../Studio/useStudioMode";
import { BASE } from "../Routing/Routes";
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
