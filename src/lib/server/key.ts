/** Session cookie lifetime in seconds: two weeks. */
export const SESSION_MAX_AGE = 1209600;

/** Bounded so a broken `exists` that always says "taken" fails loudly. */
const KEY_ATTEMPTS = 5;

export async function generateUniqueKey(
  exists: (key: string) => Promise<boolean>,
): Promise<string> {
  for (let i = 0; i < KEY_ATTEMPTS; i++) {
    const key = crypto.randomUUID();
    if (!(await exists(key))) return key;
  }
  throw new Error(
    `Could not mint an unused session key in ${KEY_ATTEMPTS} attempts`,
  );
}
