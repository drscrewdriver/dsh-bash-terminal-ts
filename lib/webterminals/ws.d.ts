import type { Duplex } from "node:stream";
import type { UiEnvironment } from "./protocol.js";
import type { UiTerminalRegistry } from "./registry.js";
/** The socket path, sibling to the config bridge. */
export declare const WS_PATH = "/bash-terminal/ws";
/** The host webserver surface this module needs. */
export interface UpgradeCapableServer {
    /**
     * The JSON route face (the same one the config bridge uses). Typed loosely on
     * purpose: the handler's request/response shapes are the Node http pair, and
     * naming them here would drag `@types/node` into every caller's client graph.
     */
    register?(route: {
        kind: string;
        path: string;
        handler: unknown;
    }): (() => void) | void;
    registerUpgrade?(route: {
        path: string;
        handler: (request: {
            url?: string;
            socket?: {
                remoteAddress?: string;
            };
        }, socket: Duplex, head: Buffer) => void;
    }): (() => void) | void;
}
/** What the caller supplies so this module stays testable. */
export interface SocketDeps {
    registry: UiTerminalRegistry;
    /** The limits to advertise for one terminal's cwd. */
    environmentFor(cwd: string): UiEnvironment;
    /** Same loopback rule as the config bridge. */
    isLoopback(request: {
        socket?: {
            remoteAddress?: string;
        };
    }): boolean;
}
/** The mount outcome, so the config bridge can report a reason instead of silence. */
export type SocketMount = {
    ok: true;
    dispose(): void;
} | {
    ok: false;
    reason: "no-websocket-route";
};
/**
 * Register the socket route.
 * @returns a disposer, or the reason the host cannot carry an upgrade (older
 *  builds expose `register` only) - the caller then reports `no-websocket-route`
 *  rather than mounting a terminal that can never receive output.
 */
export declare function mountTerminalSocket(deps: SocketDeps, webServer: UpgradeCapableServer | undefined): SocketMount;
