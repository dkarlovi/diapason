import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { createAppRouter } from "./App/AppRouter";
import "./App/Styles.css";
import "./Features/Capture/Capture.css";
import "./App/Studio.css";
import "./Features/Editor/Editor.css";
import "./App/Embed.css";

createRoot(document.getElementById("root")!).render(<RouterProvider router={createAppRouter()} />);
