import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes, useParams } from "react-router";
import { Library } from "./components/Library";
import { Capture } from "./components/Capture";
import { Editor } from "./components/Editor";
import { useMidiOutput } from "./hooks/useMidiOutput";
import { BASE } from "./router";
import "./styles.css";

function MidiOutputPicker() {
  useMidiOutput();
  return (
    <label
      className="spacer"
      style={{ display: "flex", alignItems: "center", gap: ".5rem", marginTop: ".4rem" }}
    >
      MIDI out{" "}
      <select
        id="midi-output"
        style={{ width: "auto" }}
        title="Where MIDI playback goes. Remembered on this machine."
        hidden
      />
    </label>
  );
}

function TakeRoute() {
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
          <Route path="/take/:id" element={<TakeRoute />} />
          <Route path="*" element={<Library />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

// Preserve links made with the old hash router, including existing bookmarks.
if (location.hash.startsWith("#/")) {
  history.replaceState(null, "", `${BASE}${location.hash.slice(1)}`);
}

createRoot(document.getElementById("root")!).render(<App />);
