/**
 * A file inside an encrypted channel's message. The server holds only locked
 * bytes with a placeholder name; everything drawn here (the name, the size,
 * the picture, the voice) comes from the opened message and the key in it.
 * Direct messages draw their files the same way (`DmFile` in
 * `DirectMessages.tsx`); this is the channel's copy.
 */

import { useEffect, useState } from 'react';
import type { Attachment, SealedFileRef } from '@scryproof/shared';

import { api } from '../lib/api';
import { openChannelFile } from '../lib/channel-crypto';
import { isVoiceFile } from '../lib/voice-note';
import { openPicture } from './Lightbox';
import { VoicePlayer } from './VoiceNote';

/**
 * Only these are drawn in place. Anything else, SVG above all, is handed over
 * as a download and never given to the page to interpret.
 */
const PICTURE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
/** Past this a picture waits to be asked for rather than opening itself. */
const AUTO_OPEN_BYTES = 15 * 1024 * 1024;

/** Opened files, kept for the life of the tab so scrolling does not decrypt twice. */
const opened = new Map<string, Promise<string | null>>();

async function bytesOf(channelId: string, file: SealedFileRef, locked: Attachment): Promise<Uint8Array | null> {
  return openChannelFile(channelId, file, await api.downloadSealed(locked.url));
}

function objectUrlFor(channelId: string, file: SealedFileRef, locked: Attachment): Promise<string | null> {
  const existing = opened.get(file.id);
  if (existing) return existing;
  const made = (async () => {
    const bytes = await bytesOf(channelId, file, locked);
    if (!bytes) return null;
    // The type is only ever one of ours or a plain download: never what the sender typed.
    const type = PICTURE_TYPES.has(file.type) ? file.type : 'application/octet-stream';
    return URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  })();
  made.catch(() => opened.delete(file.id));
  opened.set(file.id, made);
  return made;
}

const sizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function SealedFile({ channelId, file, locked }: { channelId: string; file: SealedFileRef; locked: Attachment }) {
  if (isVoiceFile(file.name)) {
    return (
      <VoicePlayer
        id={file.id}
        name={file.name}
        load={async () => {
          const bytes = await bytesOf(channelId, file, locked);
          if (!bytes) throw new Error('This file could not be opened.');
          return bytes;
        }}
      />
    );
  }
  return <SealedFileRow channelId={channelId} file={file} locked={locked} />;
}

function SealedFileRow({ channelId, file, locked }: { channelId: string; file: SealedFileRef; locked: Attachment }) {
  const picture = PICTURE_TYPES.has(file.type);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle');

  useEffect(() => {
    if (!picture || file.size > AUTO_OPEN_BYTES) return;
    let cancelled = false;
    setState('working');
    objectUrlFor(channelId, file, locked)
      .then((made) => {
        if (cancelled) return;
        setUrl(made);
        setState(made ? 'idle' : 'failed');
      })
      .catch(() => !cancelled && setState('failed'));
    return () => {
      cancelled = true;
    };
  }, [channelId, file, locked, picture]);

  async function save() {
    setState('working');
    try {
      const made = await objectUrlFor(channelId, file, locked);
      if (!made) {
        setState('failed');
        return;
      }
      const link = document.createElement('a');
      link.href = made;
      link.download = file.name;
      link.click();
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  if (picture && url) {
    return (
      <button type="button" className="attachment-open" title="Look closer" onClick={() => openPicture({ url, name: file.name })}>
        <img className="attachment-image" src={url} alt={file.name} />
      </button>
    );
  }

  return (
    <button type="button" className="attachment-file dm-file" disabled={state === 'working'} onClick={() => void save()}>
      {file.name}
      <span style={{ color: 'var(--text-dim)' }}>
        {state === 'failed' ? 'could not be opened' : state === 'working' ? 'unlocking' : sizeLabel(file.size)}
      </span>
    </button>
  );
}
