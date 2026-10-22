import { allRecordings, deleteRecording, getRecording, putRecording, storageEstimate, type Recording } from '../db';
import { $, show, fmtDate } from '../ui';
import { go } from '../router';
import { decodeAudio } from '../codec';
import { analyzeBuffer } from '../recorder';
import { playPcm, playNotes, type Playback } from '../playback';
import { takeNotes } from '../take';
import { onOutputChange } from '../midiout';
import type { Frame } from '../notes';

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Decoded audio / analysis per take, kept while the library is open so replays are instant.
const decoded = new Map<string, { pcm: Float32Array; frames?: Frame[] }>();
let playback: Playback | null = null;
let playingBtn: HTMLButtonElement | null = null;
let rafId = 0;
let offOutput: (() => void) | null = null;

function stopPlayback(): void {
  playback?.stop();
  playback = null;
  if (playingBtn) playingBtn.textContent = playingBtn.dataset.label!;
  playingBtn = null;
  cancelAnimationFrame(rafId);
}

async function togglePlay(btn: HTMLButtonElement, r: Recording, what: 'audio' | 'midi'): Promise<void> {
  const wasThis = playingBtn === btn;
  stopPlayback();
  if (wasThis) return;
  btn.dataset.label ??= btn.textContent!;
  btn.textContent = '■ Stop';
  playingBtn = btn;

  let d = decoded.get(r.id);
  if (!d) decoded.set(r.id, (d = { pcm: await decodeAudio(r.audio) }));
  if (what === 'midi') d.frames ??= analyzeBuffer(d.pcm, r.sampleRate, { maskBpm: r.bpm });
  if (playingBtn !== btn) return; // stopped or switched while decoding

  playback = what === 'audio' ? playPcm(d.pcm, r.sampleRate) : playNotes(takeNotes(r, d.frames!), r.durationSec, r.play);
  const tick = (): void => {
    if (playback?.position() == null) return stopPlayback();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

async function render(): Promise<void> {
  stopPlayback(); // the cards (and their buttons) are rebuilt
  const takes = await allRecordings();
  show('library-empty', takes.length === 0);

  const list = $('library-list');
  list.innerHTML = '';
  for (const r of takes) {
    const card = document.createElement('div');
    card.className = 'take';
    const dur = r.durationSec.toFixed(1);
    card.innerHTML = `
      <div>
        <div class="name"></div>
        <div class="meta">${fmtDate(r.createdAt)} · ${r.bpm} BPM · ${dur}s</div>
      </div>
      <div class="actions">
        <button data-act="audio" class="play">▶ Audio</button>
        <button data-act="midi" class="play">▶ MIDI</button>
        <button data-act="open" class="primary">Open</button>
        <button data-act="dup">Duplicate</button>
        <button data-act="del" class="danger">Delete</button>
      </div>`;
    (card.querySelector('.name') as HTMLElement).textContent = r.name;
    for (const what of ['audio', 'midi'] as const) {
      const btn = card.querySelector<HTMLButtonElement>(`[data-act="${what}"]`)!;
      btn.addEventListener('click', () => void togglePlay(btn, r, what));
    }
    card.querySelector('[data-act="open"]')!.addEventListener('click', () => go(`#/take/${r.id}`));
    card.querySelector('[data-act="dup"]')!.addEventListener('click', () => void duplicate(r.id));
    card.querySelector('[data-act="del"]')!.addEventListener('click', () => void remove(r));
    list.appendChild(card);
  }

  const est = await storageEstimate();
  $('storage-line').textContent = est
    ? `${takes.length} take(s) · ~${(est.usage / 1e6).toFixed(1)} MB used`
    : `${takes.length} take(s)`;
}

async function duplicate(id: string): Promise<void> {
  const r = await getRecording(id);
  if (!r) return;
  const copy: Recording = { ...r, id: uid(), name: `${r.name} (copy)`, createdAt: Date.now() };
  await putRecording(copy);
  await render();
}

async function remove(r: Recording): Promise<void> {
  if (!confirm(`Delete “${r.name}”? This can't be undone.`)) return;
  stopPlayback();
  decoded.delete(r.id);
  await deleteRecording(r.id);
  await render();
}

export function activateLibrary(): void {
  show('view-library', true);
  $('btn-new').onclick = (): void => go('#/new');
  offOutput?.();
  offOutput = onOutputChange(stopPlayback); // don't leave a take playing on the old output
  void render();
}

export function deactivateLibrary(): void {
  stopPlayback();
  offOutput?.();
  offOutput = null;
  decoded.clear(); // the editor may change tuning/mutes; re-derive next time
  show('view-library', false);
}
