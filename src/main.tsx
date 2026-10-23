import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router";
import { Library } from "./components/Library";
import { Capture } from "./components/Capture";
import { Editor } from "./components/Editor";
import { MidiOutputPicker } from "./components/MidiOutputPicker";
import { BASE } from "./router";
import "./styles.css";

function RecordingRoute() {
  const { id } = useParams();
  return id ? <Editor key={id} id={id} /> : <Library />;
}

function App() {
  return (
    <BrowserRouter basename={BASE}>
      <main>
        <header className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <h1>
              <Link to="/">
                <span>diapason</span>
              </Link>
            </h1>
            <p className="tagline">Whistle into your mic → MIDI out.</p>
          </div>
          <MidiOutputPicker />
        </header>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<Capture />} />
          <Route path="/recording/:id" element={<RecordingRoute />} />
          <Route path="*" element={<Library />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
