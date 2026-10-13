// The browser terminal's own wire vocabulary (Node-free: both halves compile it).
//
// This is NOT the host controller's protocol - the controller is absent from
// some deployments, which is the whole reason this module exists. The browser
// shim translates these frames into the `TerminalFrame` shape
// dsh-better-sidebar's terminal view expects, so the emulator never sees a
// private format. Keeping one shared module is what stops the two halves from
// drifting apart on a string literal.
export {};
