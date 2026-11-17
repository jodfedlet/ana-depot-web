import { adminLive } from "./fr/admin-live";
import { api } from "./fr/api";
import { admin } from "./fr/admin";
import { adminCatalog } from "./fr/admin-catalog";
import { adminOps } from "./fr/admin-ops";
import { customer } from "./fr/customer";
import { pwa } from "./fr/pwa";
import { store } from "./fr/store";

/** French (default language). This object DEFINES the message shape; `ht` must match it. */
export const fr = { ...store, ...customer, ...api, ...pwa, ...adminLive, admin: { ...admin, ...adminCatalog, ...adminOps } };
