// The browser terminal's screen socket: one WebSocket per attached terminal.
//
// Why a socket at all when the config channel is plain HTTP: keystrokes and PTY
// output are a bidirectional byte stream with backpressure, and polling it would
// either lag the typing or hammer the host. Everything that is *not* a stream
// (the catalog, the switches, allocation, close) stays on the existing
// `/api/bash-terminal/config` bridge, which every supported host line already
// serves - so this file adds exactly one route.
//
// Auth is the same rule the config bridge uses: the peer must be a loopback
// address. That is a DNS-rebinding / LAN defence, not authentication - anything
// that can already reach this host's loopback port can open a shell here, exactly
// as the built-in terminal let it. Which is also why there is no model-facing
// surface: no tool, no skill, no prompt injection path.
import { WebSocket, WebSocketServer } from "ws";
import { UiTerminalError } from "./registry.js";
/** The socket path, sibling to the config bridge. */
export const WS_PATH = "/bash-terminal/ws";
/**
 * Register the socket route.
 * @returns a disposer, or the reason the host cannot carry an upgrade (older
 *  builds expose `register` only) - the caller then reports `no-websocket-route`
 *  rather than mounting a terminal that can never receive output.
 */
export function mountTerminalSocket(deps, webServer) {
    if (webServer?.registerUpgrade === undefined)
        return { ok: false, reason: "no-websocket-route" };
    const wss = new WebSocketServer({ noServer: true });
    const disposeRoute = webServer.registerUpgrade({
        path: WS_PATH,
        handler: (request, socket, head) => {
            if (!deps.isLoopback(request)) {
                socket.destroy();
                return;
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                // The identity comes from the HANDSHAKE url: on a server-side socket
                // `ws.url` is not part of the documented shape, and reading it there
                // silently degrades every attach into "no such terminal".
                attach(deps, ws, (request.url ?? WS_PATH));
            });
        },
    });
    return {
        ok: true,
        dispose: () => {
            try {
                if (typeof disposeRoute === "function")
                    disposeRoute();
            }
            catch { /* the route is already gone */ }
            for (const client of Array.from(wss.clients)) {
                try {
                    client.close(1001, "plugin unloaded");
                }
                catch { /* already closed */ }
            }
            wss.close();
        },
    };
}
/** Bind one connected socket to its terminal, both directions. */
function attach(deps, ws, requestUrl) {
    const send = (frame) => {
        if (ws.readyState !== WebSocket.OPEN)
            return;
        try {
            ws.send(JSON.stringify(frame));
        }
        catch {
            // A socket that cannot take a frame is already closing; the detach below
            // runs on the close event and the registry's reaper handles the process.
        }
    };
    const id = new URL(requestUrl, "http://dsh.internal").searchParams.get("id") ?? "";
    const info = id.length === 0 ? undefined : deps.registry.get(id);
    if (info === undefined) {
        send({ t: "error", code: "missingTerminal", message: "no such terminal (it was closed, or the host restarted)" });
        ws.close(4404, "missing terminal");
        return;
    }
    const terminalId = info.id;
    const detach = deps.registry.attach(terminalId, {
        onData: (data) => { send({ t: "data", data }); },
        onExit: (finalInfo) => { send({ t: "exit", info: finalInfo }); },
    });
    // The snapshot is taken AFTER the attach, and the event loop cannot interleave a
    // chunk between the two, so no byte is both replayed and streamed live.
    send({
        t: "snapshot",
        screen: deps.registry.screen(terminalId),
        info: deps.registry.get(terminalId) ?? info,
        environment: deps.environmentFor(info.cwd),
    });
    ws.on("message", (raw) => { void handleFrame(raw); });
    ws.on("close", () => { detach(); });
    /** One inbound client frame -> the registry. */
    async function handleFrame(raw) {
        let frame;
        try {
            const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : "";
            frame = JSON.parse(text);
        }
        catch {
            send({ t: "error", code: "bad-request", message: "socket frames must be JSON" });
            return;
        }
        try {
            switch (frame.t) {
                case "input":
                    await deps.registry.write(terminalId, typeof frame.data === "string" ? frame.data : "");
                    return;
                case "resize": {
                    const resized = await deps.registry.resize(terminalId, frame.cols, frame.rows);
                    send({ t: "resized", resized });
                    return;
                }
                case "signal":
                    await deps.registry.signal(terminalId, frame.signal);
                    return;
                case "close":
                    detach();
                    await deps.registry.close(terminalId);
                    ws.close(1000, "closed");
                    return;
                case "ping":
                    send({ t: "pong" });
                    return;
                default:
                    send({ t: "error", code: "bad-request", message: "unknown socket frame" });
            }
        }
        catch (error) {
            const failure = error instanceof UiTerminalError
                ? { code: error.code, message: error.message }
                : { code: "spawn-failed", message: error instanceof Error ? error.message : String(error) };
            send({ t: "error", ...failure });
        }
    }
}
