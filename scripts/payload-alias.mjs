// scripts/payload-alias.mjs - the payload's entry in the HOST's right-sidebar
// terminal menu, shared by link-shells.mjs and provision-payload.mjs.
//
// Why a hard link with its own name (same rule as git-bash.exe / msys-bash.exe):
// `discoverShells` keys its Map by the executable FILE NAME and keeps the
// earliest entry. The payload's binary is `bash.exe` - the same key the stock
// list spends on `C:\Windows\System32\bash.exe`, the WSL forwarder. A link
// inside the payload's own `bin\` named `bash-terminal.exe` (a) cannot collide
// with the WSL `bash` row, (b) is only ever present after an operator
// provisioned AND digest-verified a payload, and (c) keeps bash's POSIX-root
// derivation intact because it sits next to the original in the same tree.
//
// Why a junction (`payloads\bash-terminal` -> `payloads\posix-<ver>`): the
// bundle patch's candidate path must be a STABLE string - the version dir
// changes with every re-provision, the junction does not. Directory junctions
// need no privilege and may cross volumes, so the store layout is:
//
//   %LOCALAPPDATA%\dsh-bash-terminal-ts\payloads\
//     posix-5.2.37(1)\            <- the verified root (provision writes here)
//       bin\bash.exe              <- upstream binary
//       bin\bash-terminal.exe     <- hard link, the menu's own name
//     bash-terminal\  (junction)  <- stable path the patch points at
//
// The patch candidate is built with `!!js` from LOCALAPPDATA; a machine with no
// provisioned payload simply has no file at that path and discoverShells skips
// it per-candidate, exactly like a missing git-bash.exe link.
import { existsSync, linkSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/** The store layout for one env; pure, so tests can fake LOCALAPPDATA. */
export function payloadAliasPaths(env) {
  const local = (env.LOCALAPPDATA ?? "").trim();
  if (local.length === 0) return undefined;
  const store = join(local, "dsh-bash-terminal-ts", "payloads");
  return {
    store,
    junction: join(store, "bash-terminal"),
    /** The stable candidate the bundle patch points at (junction + link name). */
    candidate: join(store, "bash-terminal", "bin", "bash-terminal.exe"),
  };
}

/** The newest provisioned root under the store (`posix-*` with bin/bash.exe). */
export function findPayloadStoreRoot(store, readdir = readdirSync, exists = existsSync) {
  try {
    return readdir(store)
      .filter((name) => name.startsWith("posix-"))
      .filter((name) => exists(join(store, name, "bin", "bash.exe")))
      .sort()
      .pop();
  } catch {
    return undefined;
  }
}

/**
 * Create (idempotently) the hard link inside the root and the junction.
 * @param {{root: string, junction: string}} target root = a verified payload dir.
 * @returns {{link: string, junction: string, created: string[] , skipped?: string}}
 */
export function ensurePayloadAlias(target, log = console.log) {
  const created = [];
  const source = join(target.root, "bin", "bash.exe");
  const link = join(target.root, "bin", "bash-terminal.exe");
  if (!existsSync(source)) {
    return { link, junction: target.junction, created, skipped: `no bin/bash.exe under ${target.root}` };
  }
  if (existsSync(link)) {
    const a = statSync(source);
    const b = statSync(link);
    if (a.ino !== b.ino || a.dev !== b.dev) {
      return { link, junction: target.junction, created, skipped: `${link} exists but is NOT a hard link of bash.exe` };
    }
  } else {
    linkSync(source, link);
    created.push(link);
    log(`created ${link}`);
  }
  // Junction: mklink /J via cmd (no privilege needed; works cross-volume).
  if (existsSync(target.junction)) {
    // A junction reads as a directory through existsSync; trust it if the
    // candidate resolves through it.
    if (existsSync(link.replace(target.root, join(target.junction, ""))) || existsSync(join(target.junction, "bin", "bash-terminal.exe"))) {
      return { link, junction: target.junction, created };
    }
    return { link, junction: target.junction, created, skipped: `${target.junction} exists but does not reach the payload bin` };
  }
  mkdirSync(target.store ?? join(target.junction, ".."), { recursive: true });
  const r = spawnSync("cmd", ["/c", "mklink", "/J", target.junction, target.root], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) {
    return { link, junction: target.junction, created, skipped: `mklink /J failed (exit ${r.status}): ${(r.stderr ?? "").trim()}` };
  }
  created.push(target.junction);
  log(`created junction ${target.junction} -> ${target.root}`);
  return { link, junction: target.junction, created };
}
