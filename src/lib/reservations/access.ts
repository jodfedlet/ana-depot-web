import type { Reservation } from "./types";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Verification by phone number: the digits the visitor typed must match the reservation's
 * phone (with or without the country code). A reference alone is never enough.
 */
export function phoneMatches(r: Reservation, input: string): boolean {
  const typed = digits(input);
  const stored = digits(`${r.customer.dialCode}${r.customer.phone}`);
  const national = digits(r.customer.phone);
  if (typed.length < 6) return false;
  return typed === stored || typed === national || stored.endsWith(typed) || typed.endsWith(national);
}

export const normalizeReference = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L to avoid read-aloud mistakes
export function generateReference(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 6; i++) id += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `ANA-${id}`;
}

export interface Viewer {
  /** Signed-in customer email (demo session). */
  sessionEmail?: string | null;
  /** References this browser verified earlier as a guest. */
  verifiedReferences: string[];
}

export function canView(r: Reservation, viewer: Viewer): boolean {
  if (viewer.verifiedReferences.includes(r.reference)) return true;
  return !!viewer.sessionEmail && !!r.customer.email && r.customer.email.toLowerCase() === viewer.sessionEmail.toLowerCase();
}
