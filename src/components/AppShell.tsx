import { useStudioMode } from "../hooks/useStudioMode";
import { useStudioFullscreen } from "../hooks/useStudioFullscreen";
import { Button } from "./primitives";
import { EditorSaveStatus } from "./EditorSaveStatus";
import { useState, type PropsWithChildren } from "react";
import { Link, useLocation } from "react-router";
import { Maximize, Minimize, ChevronRight } from "lucide-react";
import { MidiOutputPicker } from "./MidiOutputPicker";
import { StudioTitleContext } from "../hooks/useStudioTitle";
import { DiapasonMark } from "./DiapasonMark";

function FullscreenButton({ state }: { state: ReturnType<typeof useStudioFullscreen> }) {
  if (!state.available && !state.active) return null;
  const label = state.active ? "Exit fullscreen" : "Enter fullscreen";
  return (
    <Button className="studio-fullscreen" aria-label={label} title={label} onClick={state.toggle}>
      {state.active ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
    </Button>
  );
}

function StudioHeader({
  capture,
  editor,
  title,
  fullscreen,
}: {
  capture: boolean;
  editor: boolean;
  title: string;
  fullscreen: ReturnType<typeof useStudioFullscreen>;
}) {
  return (
    <header className="workstation-header">
      <Link className="studio-brand" to="/" aria-label="diapason">
        <DiapasonMark />
        <span>diapason</span>
      </Link>
      {(capture || editor) && (
        <nav className="workstation-location" aria-label="Location">
          <Link to="/">Library</Link>
          <ChevronRight aria-hidden="true" />
          <h1 aria-label={title}>
            <span className="studio-title-fallback">{title}</span>
            {editor && <span id="editor-title-slot" />}
          </h1>
        </nav>
      )}
      <div className="workstation-actions">
        {(capture || editor || fullscreen.active) && <FullscreenButton state={fullscreen} />}
        <MidiOutputPicker />
        {editor && <div id="editor-actions-slot" />}
      </div>
    </header>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const { embedded } = useStudioMode();
  const fullscreen = useStudioFullscreen();
  const pathname = useLocation().pathname.replace(/\/$/, "");
  const capture = pathname === "/new";
  const editor = pathname.startsWith("/recording/");
  const [title, setTitle] = useState("");
  const screenTitle = capture ? "New recording" : title || "Recording";
  return (
    <StudioTitleContext.Provider value={setTitle}>
      <main
        onClickCapture={embedded ? undefined : fullscreen.onNavigate}
        className={
          "studio-shell " +
          (embedded ? "embed-shell " : "") +
          (capture ? "capture-shell" : editor ? "editor-shell" : "library-shell")
        }
      >
        {!embedded && (
          <StudioHeader
            capture={capture}
            editor={editor}
            title={screenTitle}
            fullscreen={fullscreen}
          />
        )}
        <EditorSaveStatus />
        {children}
      </main>
    </StudioTitleContext.Provider>
  );
}
