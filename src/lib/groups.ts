// The top page's groups, shared by the page and the server. The server guesses
// them from each picture (lib/server/groups).

export const GROUPS = [
  { key: "person", label: "人" },
  { key: "food", label: "食べ物" },
  { key: "anime", label: "アニメ・イラスト" },
  { key: "screen", label: "画面・文字" },
  { key: "cat", label: "猫" },
  { key: "dog", label: "犬" },
  { key: "animal", label: "動物" },
  { key: "other", label: "その他" },
] as const;

export type GroupKey = (typeof GROUPS)[number]["key"];

export type GroupSection = { key: GroupKey; label: string; count: number };

export const isGroup = (value: unknown): value is GroupKey =>
  GROUPS.some((g) => g.key === value);

export const groupLabel = (key: GroupKey) =>
  GROUPS.find((g) => g.key === key)!.label;
