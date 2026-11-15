import { type Reservation, customerFullName } from "./types";

export interface CustomerSummary {
  /** Stable key: the phone digits (country code included). */
  key: string;
  name: string;
  dialCode: string;
  phone: string;
  email?: string;
  /** True when at least one reservation carries an e-mail (can match a customer account). */
  hasAccount: boolean;
  reservations: Reservation[];
  lastAt: string;
}

export const customerKey = (r: Reservation) => `${r.customer.dialCode}${r.customer.phone}`.replace(/\D/g, "");

/** Customers are derived from reservations (guests included); there is no separate customer record to maintain yet. */
export function groupCustomers(all: Reservation[]): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();
  for (const r of [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = customerKey(r);
    const found = map.get(key);
    if (found) {
      found.reservations.push(r);
      if (!found.email && r.customer.email) { found.email = r.customer.email; found.hasAccount = true; }
    } else {
      map.set(key, { key, name: customerFullName(r.customer), dialCode: r.customer.dialCode, phone: r.customer.phone, email: r.customer.email, hasAccount: !!r.customer.email, reservations: [r], lastAt: r.createdAt });
    }
  }
  return [...map.values()];
}
