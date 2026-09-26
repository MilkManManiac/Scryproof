/**
 * Small pieces for building and rebuilding audio graphs while sound is
 * flowing through them.
 */

/** Something between two points of a graph: sound goes in one end and comes out the other. */
export interface Bridge {
  input: AudioNode;
  output: AudioNode;
  /** Unhooks the bridge's own nodes, `output` included. Whoever connected to `input` unhooks that. */
  close(): void;
}

/**
 * Puts `next` between `from` and `to` in place of `old`. A null bridge is a
 * plain wire from `from` to `to`; `undefined` for `old` means nothing joined
 * the two before (the first build).
 *
 * The new path is joined before the old one goes: a moment of both rather
 * than a moment of nothing. And only a join that exists is undone, because
 * Chrome throws on undoing one that does not, which is how the first build
 * of the microphone chain used to fail (2026-09-26).
 */
export function splice(from: AudioNode, to: AudioNode, old: Bridge | null | undefined, next: Bridge | null): void {
  if (next) {
    from.connect(next.input);
    next.output.connect(to);
  } else {
    from.connect(to);
  }
  if (old === undefined || old === next) return;
  if (old) {
    from.disconnect(old.input);
    old.close();
  } else if (next) {
    from.disconnect(to);
  }
}

/** Each worklet is loaded once per audio context, and a failed load is tried again next time. */
const worklets = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

export function loadWorklet(context: BaseAudioContext, url: string): Promise<void> {
  let loaded = worklets.get(context);
  if (!loaded) {
    loaded = new Map();
    worklets.set(context, loaded);
  }
  let loading = loaded.get(url);
  if (!loading) {
    loading = context.audioWorklet.addModule(url);
    loading.catch(() => loaded.delete(url));
    loaded.set(url, loading);
  }
  return loading;
}
