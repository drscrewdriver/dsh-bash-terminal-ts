// The client-side translator handle, in its own module.
//
// Both halves of the browser code need it: the settings row (registered through
// `ctx.slots`) and the bottom-dock tab (rendered by dsh-better-sidebar's own tree,
// which passes us no provider). A React context would therefore reach neither
// cleanly, and the previous revision of this plugin solved it by reading the Chinese
// dictionary object directly - registered seven languages, rendered `zh`, silently
// wrong on every other locale.
import { fallbackDict } from "./locales.js";
/**
 * The active translator. It starts on the Chinese dictionary rather than on the
 * identity function, because the oldest hosts expose no `locale.bind` at all: showing
 * raw keys there would be a regression, and Chinese is what those hosts show.
 */
let current = (key) => fallbackDict[key] ?? key;
/** Install the host-bound translator (called once from the client `apply`). */
export function setTranslator(fn) {
    current = fn;
}
/** Translate a `settings.bash-terminal` key. */
export function tr(key, params) {
    return current(key, params);
}
