declare const __LF_VERSION__: string;
declare const __LF_COMMIT__: string;

export const VERSION: string = __LF_VERSION__;
export const COMMIT: string = __LF_COMMIT__;
export const BUILD = `${VERSION} · ${COMMIT}`;
