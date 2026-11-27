import { MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, mb } from "#lib/limits.js";

export type FailKind =
  /** Not a picture format we know. */
  | "unsupported"
  /** A known format that would not decode. */
  | "corrupt"
  /** Over MAX_SOURCE_BYTES before converting. */
  | "too-large"
  /** Over MAX_UPLOAD_BYTES after converting. */
  | "output-too-large"
  /** Anything else: the encoder, a worker crash. */
  | "failed";

/** One picture that could not be made into an LGTM image. */
export class ConvertError extends Error {
  constructor(
    readonly kind: FailKind,
    readonly fileName: string,
    detail?: string,
  ) {
    super(detail ?? kind);
  }
}

/** The browser lacks something the conversion needs. */
export class UnsupportedBrowserError extends Error {}

const REASONS: Record<FailKind, string> = {
  unsupported: "対応していない形式です",
  corrupt: "画像が壊れているか、読み込めませんでした",
  "too-large": `ファイルが大きすぎます (${mb(MAX_SOURCE_BYTES)} まで)`,
  "output-too-large": `変換後の画像が ${mb(MAX_UPLOAD_BYTES)} を超えました。短いアニメーションでお試しください`,
  failed: "変換に失敗しました",
};

export function convertMessage(e: ConvertError): string {
  return `${e.fileName ? `「${e.fileName}」: ` : ""}${REASONS[e.kind]}`;
}
