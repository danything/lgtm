/**
 * CLIP ViT-B/32 (MIT), its image tower quantised to 8 bits. The Dockerfile
 * fetches the same file; stored embeddings only mean anything with it.
 */
export const MODEL = {
  repo: "Xenova/clip-vit-base-patch32",
  revision: "6b7c523703ae26e39be4b03774966f8571c7f523",
  dims: 512,
};
