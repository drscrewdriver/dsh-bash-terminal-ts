/** Install the host-bound translator (called once from the client `apply`). */
export declare function setTranslator(fn: (key: string, params?: Record<string, string | number>) => string): void;
/** Translate a `settings.bash-terminal` key. */
export declare function tr(key: string, params?: Record<string, string | number>): string;
