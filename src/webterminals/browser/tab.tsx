// The bottom-dock tab component: a shell picker plus one embedded xterm.
//
// It exists so the four shells are all reachable on a host that already ships its
// own terminal controller. Everything about the shell itself stays on the host side
// (which rows are activated and available, the argv and env, the refusal of a
// disabled choice) - this component only names a row and draws the bytes that come
// back, so there is no second copy of the shell knowledge to drift.
//
// The lifecycle rule it has to respect: an xterm instance belongs to the DOM node it
// was opened into. Switching shell or re-mounting therefore DISPOSES the old
// controller first (which sends `close`, ending that shell) and allocates a fresh
// one; a leaked instance would leave a second PTY running with nobody reading it.

import { useCallback, useEffect, useRef, useState } from "react";
import { EmbeddedTerminal, pickableRows } from "./xterm";
import type { EmbeddedPhase } from "./xterm";
import { ShellPicker } from "./shell-picker";
import { readConfig } from "./api";
import type { CatalogEntry } from "./api";
import { tr } from "../../browser-i18n";
/** The props dsh-better-sidebar hands every tab component (`TabComponentProps`). */
export interface MultiShellTabProps {
  scope?: { sessionId?: string };
  tab?: { id?: string; title?: string };
}

/** One phase rendered as a pill. */
const PHASE_KEYS: Record<EmbeddedPhase, string> = {
  allocating: "tab.phase.allocating",
  connecting: "tab.phase.connecting",
  running: "tab.phase.running",
  exited: "tab.phase.exited",
  failed: "tab.phase.failed",
};

/** The multi-shell terminal tab. */
export function MultiShellTerminal(props: MultiShellTabProps) {
  const sessionId = props.scope?.sessionId;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<EmbeddedTerminal | null>(null);
  const [rows, setRows] = useState<CatalogEntry[]>([]);
  const [shell, setShell] = useState("");
  const [phase, setPhase] = useState<EmbeddedPhase>("allocating");
  const [detail, setDetail] = useState("");
  const [title, setTitle] = useState("");
  const [generation, setGeneration] = useState(0);

  const reload = useCallback((): void => {
    readConfig().then(
      (snapshot) => {
        const pickable = pickableRows(snapshot);
        setRows(pickable);
        // Keep a still-legal pick; otherwise fall to the first one the host allows.
        setShell((current) => (pickable.some((row) => row.id === current) ? current : (pickable[0]?.id ?? "")));
      },
      () => {
        /* the effect below surfaces the failure through `detail` */
      },
    );
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || sessionId === undefined || shell === "") return;
    let cancelled = false;
    void EmbeddedTerminal.create(host, sessionId, shell, {
      onPhase: (next, reason) => {
        if (cancelled) return;
        setPhase(next);
        setDetail(reason ?? "");
      },
      onTitle: (text) => {
        if (!cancelled) setTitle(text);
      },
    }).then((result) => {
      if (result instanceof EmbeddedTerminal) {
        if (cancelled) {
          // The tab closed while the allocation was in flight; the shell it just
          // spawned has no reader, so end it here rather than orphaning a PTY.
          result.dispose();
          return;
        }
        controllerRef.current = result;
        return;
      }
      if (!cancelled) {
        setPhase("failed");
        setDetail(result.message);
      }
    });
    return () => {
      cancelled = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [sessionId, shell, generation]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", flex: "none" }}>
        <ShellPicker
          compact
          rows={rows.map((row) => ({ id: row.id, label: row.label }))}
          value={shell}
          onChange={(next) => setShell(next)}
        />
        <button
          type="button"
          className="btSelector"
          style={{ height: 28, fontSize: 12 }}
          disabled={shell === ""}
          onClick={() => {
            setGeneration((n) => n + 1);
            reload();
          }}
        >
          {tr("tab.new")}
        </button>
        <span className={"btBadge" + (phase === "running" ? " btBadgeOk" : "")}>
          {tr(PHASE_KEYS[phase])}
          {detail === "" ? "" : ` · ${detail}`}
        </span>
        {title === "" ? null : (
          <span className="btDesc" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
        )}
      </div>
      <div ref={hostRef} style={{ flex: 1, minHeight: 0, padding: "0 10px 10px", outline: "none" }} />
    </div>
  );
}
