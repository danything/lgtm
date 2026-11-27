/** Runs `fn` on the next click anywhere; for $effect, which calls the cleanup. */
export function onWindowClick(fn: () => void): () => void {
  window.addEventListener("click", fn);
  return () => window.removeEventListener("click", fn);
}
