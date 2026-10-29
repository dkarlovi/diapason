import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { createAppRouter } from "./app-router";
import "./styles.css";
import "./capture.css";
import "./studio.css";
import "./editor.css";
import "./embed.css";

createRoot(document.getElementById("root")!).render(<RouterProvider router={createAppRouter()} />);
