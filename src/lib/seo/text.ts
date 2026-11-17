/** Plain text for a meta description / JSON-LD description: whitespace collapsed and cut at a word boundary (never mid-word), with an ellipsis when cut. */
export function plainSnippet(text: string | undefined | null, max = 160): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}
