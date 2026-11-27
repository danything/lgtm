import { unlinkSync } from "node:fs";

import { generateUniqueKey } from "./key";

const DIR = "images";

export const imagePath = (fileName: string) => `${DIR}/${fileName}`;

/** Writes under a fresh uuid name and answers with it. */
export async function writeImage(bytes: Uint8Array): Promise<string> {
  const fileName = `${await generateUniqueKey((k) => Bun.file(imagePath(`${k}.webp`)).exists())}.webp`;
  await Bun.write(imagePath(fileName), bytes);
  return fileName;
}

/** Already gone counts as removed; any other failure is logged, not thrown. */
export function removeImage(fileName: string): void {
  try {
    unlinkSync(imagePath(fileName));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT")
      console.error(`could not remove ${fileName}`, e);
  }
}
