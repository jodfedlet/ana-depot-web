/** Only same-site relative paths may be used as a post-sign-in / post-verification destination (no open redirect). */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") && !/[\u0000-\u001f]/.test(next) ? next : fallback;
}
