/** `[a-z0-9-]` identifier from free text (accents folded). Used to PROPOSE a slug/key/code; the server validates and decides uniqueness. */
export function slugify(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** An attribute KEY as the API requires it: `[a-z][a-z0-9_]{0,59}` (underscores, never a hyphen, starts with a letter). Proposed from the label. */
export function keyOf(text: string): string {
  const k = slugify(text).replace(/-/g, "_").replace(/^[^a-z]+/, "").slice(0, 60);
  return k;
}
