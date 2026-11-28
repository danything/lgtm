/** Tiles in the server-rendered page; the gallery fetches more as needed. */
export const FIRST_LIMIT = 12;

/** Tiles per later fetch. The server caps at it and a shorter answer means the end. */
export const PER_PAGE = 30;

/**
 * Tiles each row of the top page starts with: enough to run past the right
 * edge of a wide screen (about 2,400px of portrait shots). A row fetches more
 * as it nears its end; ten stopped short of a 1,530px window.
 */
export const STRIP_LIMIT = 20;

/** A row stops fetching here and leaves the rest to its own page. */
export const STRIP_MAX = 80;
