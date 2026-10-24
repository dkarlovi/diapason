import { useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "react-router";
import { ChevronRight } from "lucide-react";
import { MidiOutputPicker } from "./MidiOutputPicker";
import { StudioTitleContext } from "../hooks/useStudioTitle";
import { DiapasonMark } from "./DiapasonMark";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const capture = pathname === "/new";
  const editor = pathname.startsWith("/recording/");
  const [title, setTitle] = useState("");
  return (
    <StudioTitleContext.Provider value={setTitle}>
      <main
        className={
          "studio-shell " + (capture ? "capture-shell" : editor ? "editor-shell" : "library-shell")
        }
      >
        <header className="workstation-header">
          <Link className="studio-brand" to="/" aria-label="diapason">
            <DiapasonMark />
            <span>diapason</span>
          </Link>
          {(capture || editor) && (
            <nav className="workstation-location" aria-label="Location">
              <Link to="/">Library</Link>
              <ChevronRight aria-hidden="true" />
              <h1>{capture ? "New recording" : title || "Recording"}</h1>
            </nav>
          )}
          <MidiOutputPicker />
        </header>
        {children}
      </main>
    </StudioTitleContext.Provider>
  );
}
