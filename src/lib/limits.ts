// Shared by the browser (which converts) and the server (which checks).

/** Longest side of a stored image. */
export const MAX_SIDE = 960;

/** Largest converted file the server keeps. */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

/** Largest picture the browser tries to convert; past this tabs run out of memory. */
export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

/** One upload request. Matches BODY_SIZE_LIMIT in the Dockerfile. */
export const MAX_REQUEST_BYTES = 100 * 1024 * 1024;

export const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}MB`;
