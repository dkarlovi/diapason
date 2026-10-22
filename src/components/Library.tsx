import { Link } from "react-router";
import { useLibrary, type Playing } from "../hooks/useLibrary";
import type { Recording } from "../db";
import { fmtDate } from "../ui";
import { takePath } from "../router";
import { Button, Panel } from "./primitives";

function TakeCard({
  record,
  playing,
  onPlay,
  onDuplicate,
  onDelete,
}: {
  record: Recording;
  playing: Playing;
  onPlay: (record: Recording, kind: "audio" | "midi") => void;
  onDuplicate: (id: string) => void;
  onDelete: (record: Recording) => void;
}) {
  const isPlaying = (kind: "audio" | "midi") => playing?.id === record.id && playing.kind === kind;
  return (
    <div className="take">
      <div>
        <div className="name">{record.name}</div>
        <div className="meta">
          {fmtDate(record.createdAt)} · {record.bpm} BPM · {record.durationSec.toFixed(1)}s
        </div>
      </div>
      <div className="actions">
        <Button className="play" onClick={() => onPlay(record, "audio")}>
          {isPlaying("audio") ? "■ Stop" : "▶ Audio"}
        </Button>
        <Button className="play" onClick={() => onPlay(record, "midi")}>
          {isPlaying("midi") ? "■ Stop" : "▶ MIDI"}
        </Button>
        <Link className="button primary" to={takePath(record.id)}>
          Open
        </Link>
        <Button onClick={() => onDuplicate(record.id)}>Duplicate</Button>
        <Button variant="danger" onClick={() => onDelete(record)}>
          Delete
        </Button>
      </div>
    </div>
  );
}

export function Library() {
  const { takes, storage, playing, togglePlay, duplicate, remove } = useLibrary();
  return (
    <div id="view-library">
      <div className="row" style={{ marginBottom: "1rem" }}>
        <h2 style={{ margin: 0 }}>Your takes</h2>
        <Link className="button primary spacer" to="/new">
          + New recording
        </Link>
      </div>
      {takes.length ? (
        <div className="takes">
          {takes.map((record) => (
            <TakeCard
              key={record.id}
              record={record}
              playing={playing}
              onPlay={togglePlay}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          ))}
        </div>
      ) : (
        <Panel title="Your library is empty">
          <p className="sub" style={{ textAlign: "left", margin: 0 }}>
            No takes yet. Hit <strong>+ New recording</strong>, whistle a melody to the metronome,
            and it becomes a take you can tune and export to MIDI.
          </p>
        </Panel>
      )}
      <p className="hint">{storage}</p>
    </div>
  );
}
