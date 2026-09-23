/**
 * How many tiles the server renders into the page. Kept small on purpose: the
 * gallery keeps fetching until its end marker is off screen, so a phone stops
 * near here while a large monitor carries on until it is full, and nobody
 * waits on HTML for tiles they cannot see.
 */
export const FIRST_LIMIT = 12;

/**
 * How many each later fetch asks for. Shared rather than written twice: the
 * server caps requests at it and the browser treats a shorter answer as the
 * end, so the two disagreeing would quietly stop the infinite scroll.
 */
export const PER_PAGE = 30;
