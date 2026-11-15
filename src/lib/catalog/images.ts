/** Browser-side image helpers for the product editor (demo: images stay in this browser's storage). */

/** Sample illustrations the seller can pick when no photo is at hand. */
export const sampleImageLibrary = [
  "tube-rond-galva", "fer-a-beton", "corniere-acier", "baskets-sport", "sandales-cuir", "matelas-mousse", "drap-coton-set", "table-a-manger",
  "chaise-empilable", "table-basse", "seau-pack", "corde-nylon", "boite-vis", "casserole-set",
].flatMap((slug) => [1, 2, 3].map((n) => `/sample/products/${slug}-${n}.svg`));

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Reads an uploaded file as a downscaled JPEG data URL (≈ 900 px) so many images fit in browser storage. */
export async function readImageFile(file: File, maxSize = 900): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) throw new Error("unsupported");
  if (file.type === "image/svg+xml") return fileToDataUrl(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
