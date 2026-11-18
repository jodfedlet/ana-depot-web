import type { fr } from "./fr";
import { adminLive } from "./ht/admin-live";
import { api } from "./ht/api";
import { admin } from "./ht/admin";
import { adminCatalog } from "./ht/admin-catalog";
import { adminOps } from "./ht/admin-ops";
import { adminTeam } from "./ht/admin-team";
import { customer } from "./ht/customer";
import { pwa } from "./ht/pwa";
import { store } from "./ht/store";

/** Haitian Creole. Typed against the French shape, so a missing key will not compile. */
export const ht: typeof fr = { ...store, ...customer, ...api, ...pwa, ...adminLive, ...adminTeam, admin: { ...admin, ...adminCatalog, ...adminOps } };
