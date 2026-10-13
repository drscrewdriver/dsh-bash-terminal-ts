// A listbox that draws itself, because a native <select> cannot be themed here.
//
// Why not `<select>`: the option list it opens is rendered by the operating system, not
// by the page, so every colour rule we write stops at the closed control. On a dark host
// the popup came out as a white sheet with near-white labels (reported from the running
// app) - unreadable, and not fixable from CSS because we do not own that surface.
// `color-scheme` would only guess one of the two themes, and the host can be switched at
// runtime, so the only correct answer is to draw the list ourselves and take the
// host's own tokens.
//
// Every surface below is a `--dsw-alias-*` token, which is what makes it follow the
// host's light/dark switch for free (`--dsw-alias-bg-overlay` is defined per theme).

import { useEffect, useRef, useState } from "react";
import { tr } from "../../browser-i18n";

/** One choice: a catalog row id plus the label the host resolved for it. */
export interface PickerRow {
  readonly id: string;
  readonly label: string;
}

/** Props for {@link ShellPicker}. */
export interface ShellPickerProps {
  readonly rows: readonly PickerRow[];
  readonly value: string;
  onChange(value: string): void;
  /** Shown when there is nothing to pick. Defaults to the "no shell" dictionary entry. */
  readonly emptyLabel?: string;
  /** Toolbar sizing; the settings surfaces use the host capsule at its normal size. */
  readonly compact?: boolean;
}

/**
 * A compact shell selector: a button showing the current choice and a popup list.
 *
 * Closes on an outside press and on Escape. The list stays in the DOM and is hidden with
 * the `hidden` attribute rather than unmounted: the option set is the drift guard the node
 * tests read out of server-rendered markup, and a closed picker that still carries its
 * options is also one that cannot lose them to a re-render while it is open.
 */
export function ShellPicker(props: ShellPickerProps) {
  const { rows, value, onChange } = props;
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const current = rows.find((row) => row.id === value);

  useEffect(() => {
    if (!open) return;
    const press = (event: MouseEvent) => {
      if (host.current !== null && !host.current.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", press);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", press);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div className="btPick" ref={host}>
      <button
        type="button"
        className={"btSelector btPickBtn" + (props.compact === true ? " btPickSm" : "")}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={rows.length === 0}
        onClick={() => setOpen((next) => !next)}
      >
        <span className="btPickText">{rows.length === 0 ? (props.emptyLabel ?? tr("tab.noShell")) : (current?.label ?? value)}</span>
        <span className="btPickCaret" aria-hidden="true">
          ⌄
        </span>
      </button>
      <div className="btPickList" role="listbox" hidden={!open}>
        {rows.map((row) => (
          <div
            key={row.id}
            role="option"
            data-shell={row.id}
            aria-selected={row.id === value}
            className={"btPickOpt" + (row.id === value ? " btPickOptOn" : "")}
            onClick={() => {
              onChange(row.id);
              setOpen(false);
            }}
          >
            {row.label}
          </div>
        ))}
      </div>
    </div>
  );
}
