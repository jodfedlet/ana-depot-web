"use client";

import { ApiError } from "../http";
import { getReservation, listReservations } from "./endpoints";
import { useAdminResource } from "./hooks";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One reservation for staff, opened by its reference (the customer-facing key) or by id. The reference is resolved by the server (list search), then the detail is read. */
export function useAdminReservation(refOrId: string) {
  return useAdminResource(`admin-reservation:${refOrId}`, async (signal) => {
    let id = refOrId;
    if (!UUID.test(refOrId)) {
      const wanted = refOrId.replace(/\s+/g, "").toUpperCase();
      const found = (await listReservations({ q: wanted, size: 5 }, { signal })).items.find((r) => r.reference === wanted);
      if (!found) throw new ApiError({ status: 404, code: "reservation_not_found" });
      id = found.id;
    }
    return getReservation(id, { signal });
  });
}
