/** Processor registration belongs to its AudioContext, not to the app globally. */
const modules = new WeakMap<AudioContext, Map<string, Promise<void>>>();
export async function ensureAudioWorklet(
  context: AudioContext,
  name: string,
  source: string,
): Promise<void> {
  let registered = modules.get(context);
  if (!registered) {
    registered = new Map();
    modules.set(context, registered);
  }
  let ready = registered.get(name);
  if (!ready) {
    const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
    ready = context.audioWorklet
      .addModule(url)
      .catch((error) => {
        registered.delete(name);
        throw error;
      })
      .finally(() => URL.revokeObjectURL(url));
    registered.set(name, ready);
  }
  await ready;
}
