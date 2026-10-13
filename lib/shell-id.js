// The shell identifier, in its own module on purpose.
//
// `shells.ts` needs `NodeJS.Platform` and the resolved-path types, so it belongs
// to the host compile graph only. The browser half still has to name the same
// four ids (in the socket frames and the catalog rows it renders), so the id type
// lives here - a module with no Node references at all, which is what lets it sit
// in both tsconfig graphs without dragging `@types/node` into the client purity
// gate.
export {};
