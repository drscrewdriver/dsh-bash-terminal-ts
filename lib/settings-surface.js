// Which settings surface this host line actually renders.
//
// Why the plugin needs to know: the settings live on the bundle detail page and on the
// family tab, but 0.1.0-rc.x / 0.1.1-rc.x declare the whole `settings.*` slot map while
// shipping **no page that renders it** - a card registered there is a card nobody can
// open, and the only surface that paints is a shell-level overlay the plugin brings
// itself. Showing that overlay on newer lines instead would put a third settings surface
// over a working page, so it has to be conditional, and "which line am I on" must be
// answered by capability rather than by a version string.
//
// The three generations are mutually exclusive on the settings SERVICE, which the plugin
// already receives through `ctx.inject(["settings"])`:
//
//   0.1.0 / 0.1.1  `register` yes,   `installSection` no   -> no settings page at all
//   0.1.2 / 0.1.5  `installSection` yes                    -> settings page exists
//   0.1.7+ / 0.2.0 neither (both removed with rc.1, #40)   -> settings page exists
//
// Probing the service rather than importing `@deepseek-ai/dsh-settings` is deliberate:
// the host packages live in the application's own tree, not in the profile's
// `node_modules`, so a dynamic import from a plugin either fails (-> a permanent
// "unknown", i.e. no fallback on exactly the lines that need one) or resolves a *fetched
// copy* that is not the module the running host loaded. Both answers would be wrong.
let settled = "unknown";
/**
 * Classify a settings service by what it exposes.
 *
 * Exported separately from `reportSettingsSurface` so every branch is testable without a
 * host: the order matters. `installSection` outranks `register` because its presence is
 * the 0.1.2 generation, which does have a page; only a line with `register` and no
 * `installSection` is the first generation.
 */
export function classifySettingsService(svc) {
    if (svc === undefined)
        return "unknown";
    if (typeof svc.installSection === "function")
        return "page";
    if (typeof svc.register === "function")
        return "none";
    return "page";
}
/** Record the answer for the route handler and return it. */
export function reportSettingsSurface(svc) {
    settled = classifySettingsService(svc);
    return settled;
}
/** The last answer the host gave, or `unknown` before the settings service arrived. */
export function settingsSurface() {
    return settled;
}
