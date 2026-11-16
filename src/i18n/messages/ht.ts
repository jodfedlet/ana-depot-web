import type { fr } from "./fr";
import { admin } from "./ht/admin";
import { adminCatalog } from "./ht/admin-catalog";
import { adminOps } from "./ht/admin-ops";
import { customer } from "./ht/customer";
import { store } from "./ht/store";

/** Haitian Creole. Typed against the French shape, so a missing key will not compile. */
export const ht: typeof fr = { ...store, ...customer, admin: { ...admin, ...adminCatalog, ...adminOps } };
