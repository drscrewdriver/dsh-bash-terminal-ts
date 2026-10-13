// Absolute bases and prefix-safe resolution for this plugin's own host routes.
//
// The two facts here are the ones that break a plugin on the Electron shell, and
// both were learned the hard way upstream (adapted from dsh-better-sidebar's
// `desktop-env.ts` / `host-route-url.ts`, MIT):
//
// - the shell serves the GUI from `dsh-app://app/`, whose `location.host` is the
//   literal string `app`; resolving a `ws:` URL against the PAGE base produces
//   `ws://app/...`, which never completes a DNS lookup. The shell publishes the
//   Host's real base as `__DSH_TRANSPORT__.streamBaseUrl`, and the Host accepts
//   the shell page's origin on those sockets;
// - HTTP must STAY on the page base: the shell's protocol handler forwards every
//   non-static `dsh-app://app` path to the Host same-origin, while the Host's
//   plugin routes send no `Access-Control-Allow-*` headers, so a cross-origin POST
//   to the injected origin is blocked outright ("Failed to fetch").
//
// A URL built with a LEADING SLASH pins itself to the origin root, so under a
// reverse-proxy directory (`https://host/dsh/proxy/3080/`) every request leaves the
// prefix. Resolving a RELATIVE path against the page's own base keeps it inside -
// which is why leading slashes are stripped on purpose below.

/** The transport facts the desktop shell injects before any plugin script runs. */
interface ShellTransport {
  /** The Host's real origin, the base every DSH socket resolves against. */
  streamBaseUrl?: string;
}

/** Absolute base for non-DOM callers (specs): resolution needs one, and the request is never issued. */
const PLACEHOLDER_ORIGIN = "http://dsh.internal/";

function injectedTransportBase(): string | undefined {
  const transport = (globalThis as { __DSH_TRANSPORT__?: ShellTransport }).__DSH_TRANSPORT__;
  const base = transport?.streamBaseUrl;
  return typeof base === "string" && base !== "" ? base : undefined;
}

/** The socket base: the Host's real origin, else the page base, else ''. */
export function hostTransportBase(): string {
  const injected = injectedTransportBase();
  if (injected !== undefined) return injected;
  return typeof document !== "undefined" && typeof document.baseURI === "string" ? document.baseURI : "";
}

/** The HTTP base: always the PAGE's own base (see the module doc). */
export function hostHttpBase(): string {
  const base = typeof document !== "undefined" ? document.baseURI : undefined;
  if (typeof base === "string" && base !== "") return base;
  return hostTransportBase();
}

/** Drop the query/hash and force a trailing slash (a directory base). */
function directoryBase(baseUrl: string): string {
  const url = new URL(baseUrl === "" ? PLACEHOLDER_ORIGIN : baseUrl, PLACEHOLDER_ORIGIN);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

/** One HTTP route URL, resolved against the page base. */
export function hostRouteUrl(path: string, baseUrl: string = hostHttpBase()): URL {
  return new URL(path.replace(/^\/+/, ""), directoryBase(baseUrl));
}

/** One WebSocket URL (the `ws:`/`wss:` scheme `WebSocket` requires). */
export function hostWebSocketUrl(path: string, baseUrl: string = hostTransportBase()): URL {
  const url = hostRouteUrl(path, baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}
