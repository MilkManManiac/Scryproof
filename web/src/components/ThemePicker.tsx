/**
 * Choose the room. A card per theme, each painted in that theme, so the choice
 * is made by looking rather than by reading a name.
 *
 * A theme is a `:root[data-theme="id"]` block, and `:root` is only ever the
 * page, so a card cannot pick its theme up from the cascade. Instead the
 * block's custom properties are read out of the loaded stylesheets once and
 * set on the card inline; every var() in the card's rules then resolves to
 * that theme. Same-origin stylesheets only, which is all this app has.
 */

import { useMemo, useSyncExternalStore, type CSSProperties } from "react";

import { canZoom, isDesktop, publicOrigin } from "../lib/desktop";
import { interfaceScale, SCALE_STEPS } from "../lib/interface-scale";
import { theme } from "../lib/theme";
import { THEMES } from "../lib/themes";
import { Modal } from "./Modal";

function tokensFor(id: string): CSSProperties {
  const wanted = `:root[data-theme="${id}"]`;
  const tokens: Record<string, string> = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // A stylesheet from elsewhere would refuse; there are none.
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const selectors = rule.selectorText
        .split(",")
        .map((entry) => entry.trim());
      if (!selectors.includes(wanted)) continue;
      for (const name of Array.from(rule.style)) {
        if (name.startsWith("--"))
          tokens[name] = rule.style.getPropertyValue(name).trim();
      }
    }
  }
  return tokens as CSSProperties;
}

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const current = useSyncExternalStore(theme.subscribe, theme.get);
  const scale = useSyncExternalStore(
    interfaceScale.subscribe,
    interfaceScale.get,
  );
  // Read once per opening: the stylesheets do not change while the dialog is up.
  const painted = useMemo(
    () => new Map(THEMES.map((entry) => [entry.id, tokensFor(entry.id)])),
    [],
  );

  return (
    <Modal
      title="Themes"
      className="themes"
      onClose={onClose}
      footer={
        <button type="button" className="button inline" onClick={onClose}>
          Done
        </button>
      }
    >
      <p className="settings-note">
        The room behind everything. Kept on this computer only; nobody else sees
        your choice.
      </p>
      <div className="theme-cards">
        {THEMES.map((entry) => {
          const inUse = entry.id === current;
          return (
            <button
              key={entry.id}
              type="button"
              className={inUse ? "theme-card in-use" : "theme-card"}
              data-theme={entry.id}
              style={painted.get(entry.id)}
              aria-pressed={inUse}
              onClick={() => theme.set(entry.id)}
            >
              <div className="theme-card-scene" aria-hidden="true">
                <div className="theme-card-page">
                  <strong>Scryproof</strong>
                  <span>
                    <em>#</em>{" "}
                    {entry.name
                      .toLowerCase()
                      .replace(/[^a-z]+/g, "-")
                      .replace(/^-|-$/g, "")}
                  </span>
                </div>
              </div>
              <div className="theme-card-text">
                <div className="theme-card-name">
                  {entry.name}
                  {inUse ? <small>In use</small> : null}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="settings-note">
        Interface scale.{" "}
        {canZoom ? (
          "Also kept on this computer only."
        ) : isDesktop ? (
          <>
            Needs the newest desktop app:{" "}
            <a href={`${publicOrigin()}/download/Scryproof-Setup.exe`}>
              download it
            </a>{" "}
            and run it once.
          </>
        ) : (
          "In a browser, hold Ctrl and press + or - to do the same."
        )}
      </p>
      {canZoom ? (
        <div className="scale-steps">
          {SCALE_STEPS.map((percent) => (
            <button
              key={percent}
              type="button"
              className={percent === scale ? "scale-step in-use" : "scale-step"}
              aria-pressed={percent === scale}
              onClick={() => interfaceScale.set(percent)}
            >
              {percent}%
            </button>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
