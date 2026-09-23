/**
 * The desktop app's screen-share picker. In the app, Windows has no picker of
 * its own for Electron to hand over to, so when the page asks to share, the
 * shell gathers the screens and windows with small pictures and asks the page
 * to draw the choice. The shell, not this dialog, decides what is shared: it
 * only accepts an id it offered, and anything else is a cancel
 * (`desktop/src/share-menu.js`).
 *
 * In a browser this never opens: Chrome's own picker, with its own previews,
 * is used, and a page cannot restyle it. In a shell older than this dialog it
 * never opens either; that shell shows its menu.
 */

import { useCallback, useEffect, useState } from 'react';

import { answerShare, onShareRequest, refreshShare, type ShareRequest, type ShareSource } from '../lib/desktop';
import { Modal } from './Modal';

/** Often enough to look live, seldom enough to stay cheap: the pictures are small. */
const REFRESH_MS = 2000;

type Tab = 'screen' | 'window';

export function SharePicker() {
  const [request, setRequest] = useState<ShareRequest | null>(null);
  const [tab, setTab] = useState<Tab>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [withSound, setWithSound] = useState(false);

  useEffect(
    () =>
      onShareRequest(
        (next) => {
          const first = next.sources.find((source) => source.kind === 'screen') ?? next.sources[0] ?? null;
          setRequest(next);
          setTab(first?.kind ?? 'screen');
          setSelected(first?.id ?? null);
          setWithSound(next.sound === true);
        },
        () => setRequest(null),
      ) ?? undefined,
    [],
  );

  const open = request !== null;

  // Fresh pictures while it is open, and none once it closes. A source that
  // went away (a window closed) goes from the grid, and from the selection.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const timer = setInterval(() => {
      void refreshShare().then((sources) => {
        if (!live || !sources) return;
        setRequest((current) => (current ? { ...current, sources } : current));
        setSelected((id) => (id && sources.some((source) => source.id === id) ? id : null));
      });
    }, REFRESH_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [open]);

  const cancel = useCallback(() => {
    setRequest(null);
    answerShare(null);
  }, []);

  if (!request) return null;

  const share = (id: string | null) => {
    if (!id) return;
    setRequest(null);
    answerShare({ id, withSound: request.sound !== null && withSound });
  };

  const screens = request.sources.filter((source) => source.kind === 'screen');
  const windows = request.sources.filter((source) => source.kind === 'window');
  const shown = tab === 'screen' ? screens : windows;

  return (
    <Modal
      title="Share your screen"
      className="share-picker"
      onClose={cancel}
      footer={
        <>
          {request.sound !== null ? (
            <label className="share-picker-sound">
              <input
                type="checkbox"
                className="perm-switch"
                checked={withSound}
                onChange={(event) => setWithSound(event.target.checked)}
              />
              <span>{request.soundLabel}</span>
            </label>
          ) : null}
          <button type="button" className="button secondary inline" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="button inline" disabled={!selected} onClick={() => share(selected)}>
            Share
          </button>
        </>
      }
    >
      <div className="settings-tabs share-picker-tabs" role="tablist">
        {(
          [
            ['screen', 'Screens', screens.length],
            ['window', 'Applications', windows.length],
          ] as const
        ).map(([kind, label, count]) => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={tab === kind}
            className={tab === kind ? 'settings-tab active' : 'settings-tab'}
            onClick={() => setTab(kind)}
          >
            {label} <span className="share-picker-count">{count}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="share-picker-empty">{tab === 'screen' ? 'No screens to share.' : 'No open windows to share.'}</p>
      ) : (
        <div className="share-picker-grid" role="listbox" aria-label={tab === 'screen' ? 'Screens' : 'Applications'}>
          {shown.map((source) => (
            <SourceTile
              key={source.id}
              source={source}
              selected={source.id === selected}
              onSelect={() => setSelected(source.id)}
              onShare={() => share(source.id)}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function SourceTile({
  source,
  selected,
  onSelect,
  onShare,
}: {
  source: ShareSource;
  selected: boolean;
  onSelect: () => void;
  onShare: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={selected ? 'share-tile selected' : 'share-tile'}
      title={source.name}
      onClick={onSelect}
      onDoubleClick={onShare}
    >
      <span className="share-tile-picture">
        {source.thumbnail ? (
          <img src={source.thumbnail} alt="" draggable={false} />
        ) : source.icon ? (
          <img className="share-tile-stand-in" src={source.icon} alt="" draggable={false} />
        ) : null}
      </span>
      <span className="share-tile-name">
        {source.icon ? <img src={source.icon} alt="" width={16} height={16} draggable={false} /> : null}
        <span>{source.name}</span>
      </span>
    </button>
  );
}
