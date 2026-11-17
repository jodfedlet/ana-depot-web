import { decimalToMinor } from "../api/decimal";
import type { AdminBalance } from "../api/admin/dto";

/** DISPLAY helpers only (the server computes every balance): is a currency's paid amount larger than its total, i.e. was it over-paid? */
export function isOverpaid(b: AdminBalance): boolean {
  const paid = decimalToMinor(b.paid, b.currency), total = decimalToMinor(b.total, b.currency);
  return paid !== null && total !== null && paid > total;
}
export const isSettled = (b: AdminBalance): boolean => decimalToMinor(b.due, b.currency) === 0;
export const hasPayments = (balances: AdminBalance[]): boolean => balances.some((b) => (decimalToMinor(b.paid, b.currency) ?? 0) > 0);
