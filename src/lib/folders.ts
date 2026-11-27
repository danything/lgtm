// Shared by the page and the server.

/** A folder's id, "none" for images in no folder, or undefined for all. */
export type FolderFilter = number | "none" | undefined;

export type Folder = { id: number; name: string; images: number };

export const FOLDER_NAME_MAX = 40;

export function parseFolder(value: string | null | undefined): FolderFilter {
  if (value === "none") return "none";
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** The ?folder= value for a filter, or "" for all. */
export const folderParam = (folder: FolderFilter) =>
  folder === undefined ? "" : String(folder);
