import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useParams } from "react-router";
import { Library } from "./components/Library";
import { Capture } from "./components/Capture";
import { Editor } from "./components/Editor";
import { AppShell } from "./components/AppShell";
import { StudioBoundary } from "./hooks/useStudioMode";
import { BASE } from "./router";
import "./styles.css";
import "./capture.css";
import "./studio.css";
import "./editor.css";
import "./embed.css";

function RecordingRoute() {
  const { id } = useParams();
  return id ? <Editor key={id} id={id} /> : <Library />;
}

function App() {
  return (
    <BrowserRouter basename={BASE}>
      <StudioBoundary>
        <AppShell>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/new" element={<Capture />} />
            <Route path="/recording/:id" element={<RecordingRoute />} />
            <Route path="*" element={<Library />} />
          </Routes>
        </AppShell>
      </StudioBoundary>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
