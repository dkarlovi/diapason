import { onRoute, go, type Route } from './router';
import { activateLibrary, deactivateLibrary } from './views/library';
import { activateCapture, deactivateCapture } from './views/capture';
import { activateEditor, deactivateEditor } from './views/editor';
import { bindOutputSelect } from './midiout';

let current: Route['name'] | null = null;

function deactivate(name: Route['name']): void {
  if (name === 'library') deactivateLibrary();
  else if (name === 'capture') deactivateCapture();
  else if (name === 'editor') deactivateEditor();
}

onRoute((route) => {
  if (current && current !== route.name) deactivate(current);
  // Editor needs re-activation even when staying on 'editor' (different id).
  else if (current === route.name && route.name === 'editor') deactivateEditor();

  current = route.name;
  if (route.name === 'library') activateLibrary();
  else if (route.name === 'capture') activateCapture();
  else activateEditor(route.id);
});

document.getElementById('home-link')?.addEventListener('click', () => go('#/'));

bindOutputSelect(document.getElementById('midi-output') as HTMLSelectElement);
