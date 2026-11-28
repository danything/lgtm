// A stand-in for clip.worker.ts in infer.test.ts. It answers with the bytes
// doubled, after webp[1] milliseconds; webp[0] = 255 makes it exit instead.
import type { Reply, Request, Start } from "./clip.worker";

declare const self: Worker;

self.onmessage = ({ data }: MessageEvent<Start | Request>) => {
  if ("dir" in data) return;
  if (data.webp[0] === 255) process.exit(1);
  setTimeout(() => {
    const embedding = Float32Array.from(data.webp, (x) => x * 2);
    self.postMessage({ id: data.id, embedding } satisfies Reply);
  }, data.webp[1]);
};
