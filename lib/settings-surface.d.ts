/** The surface this host offers the plugin's settings. */
export type SettingsSurface = "unknown" | "page" | "none";
/** The settings-service capabilities the classification reads. */
export interface SettingsSurfaceProbe {
    register?: unknown;
    installSection?: unknown;
}
/**
 * Classify a settings service by what it exposes.
 *
 * Exported separately from `reportSettingsSurface` so every branch is testable without a
 * host: the order matters. `installSection` outranks `register` because its presence is
 * the 0.1.2 generation, which does have a page; only a line with `register` and no
 * `installSection` is the first generation.
 */
export declare function classifySettingsService(svc: SettingsSurfaceProbe | undefined): SettingsSurface;
/** Record the answer for the route handler and return it. */
export declare function reportSettingsSurface(svc: SettingsSurfaceProbe | undefined): SettingsSurface;
/** The last answer the host gave, or `unknown` before the settings service arrived. */
export declare function settingsSurface(): SettingsSurface;
