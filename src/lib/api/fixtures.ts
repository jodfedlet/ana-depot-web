import type { CategoryDto, PickupDto, ProductDto, ReservationViewDto } from "./dto";

/** Wire fixtures shaped exactly like the examples in `ana-depot-api/docs/api.md`. Tests only: they are mocks of the contract, not the real server. */
export const category: CategoryDto = {
  id: "c1", slug: "mattresses", name: { fr: "Matelas", ht: "Matla" }, description: { fr: "Pour dormir", ht: "" }, imageUrl: null, displayOrder: 1, productCount: 2,
  attributes: [
    { id: "a-size", key: "size", label: { fr: "Taille", ht: "Gwosè" }, type: "CHOICE", unit: null, required: false, filterable: true, variantAxis: true, displayOrder: 1,
      options: [{ id: "o-s", code: "s", label: { fr: "Petit", ht: "Piti" }, displayOrder: 1 }, { id: "o-l", code: "l", label: { fr: "Grand", ht: "Gran" }, displayOrder: 2 }] },
    { id: "a-thick", key: "thickness", label: { fr: "Épaisseur" }, type: "NUMBER", unit: "cm", required: false, filterable: false, variantAxis: false, displayOrder: 2, options: [] },
    { id: "a-note", key: "note", label: { fr: "Remarque" }, type: "TEXT", unit: null, required: false, filterable: false, variantAxis: false, displayOrder: 3, options: [] },
  ],
};

export const mattress: ProductDto = {
  id: "p1", sku: "MAT-001", slug: "matelas-confort", categoryId: "c1", categorySlug: "mattresses",
  name: { fr: "Matelas confort", ht: "Matla konfò" }, description: { fr: "Un.\n\nDeux.", ht: "" }, brand: "Ana", sellingUnit: "UNIT", unitNote: {},
  prices: [
    { currency: "HTG", retailPrice: "25000.00", salePrice: "22500.00", minOrderQuantity: 1, wholesaleEnabled: true, wholesaleTiers: [{ minQuantity: 5, unitPrice: "20000.00" }] },
    { currency: "USD", retailPrice: "180.00", salePrice: null, minOrderQuantity: 2, wholesaleEnabled: true, wholesaleTiers: [{ minQuantity: 5, unitPrice: "165.00" }] },
  ],
  variants: [
    { id: "v-s", sku: "MAT-001-S", axisValues: { "a-size": "o-s" }, retailPrices: [], availability: "IN_STOCK", availableQuantity: 12 },
    { id: "v-l", sku: "MAT-001-L", axisValues: { "a-size": "o-l" }, retailPrices: [{ currency: "HTG", retailPrice: "30000.00" }], availability: "LOW_STOCK", availableQuantity: 3 },
  ],
  images: [{ id: "i2", url: "https://images.example/b.jpg", alt: {}, position: 1 }, { id: "i1", url: "https://images.example/a.jpg", alt: { fr: "Vue de face" }, position: 0 }],
  attributes: [{ attributeId: "a-thick", optionId: null, text: null, number: 20 }, { attributeId: "a-note", optionId: null, text: "Ferme", number: null }],
  availability: "IN_STOCK", availableQuantity: 15, createdAt: "2026-11-16T12:00:00Z",
};

export const simple: ProductDto = {
  id: "p2", sku: "CAS-1", slug: "casserole", categoryId: "c2", categorySlug: "kitchen", name: { fr: "Casserole" }, description: {}, brand: null, sellingUnit: "SET", unitNote: {},
  prices: [{ currency: "HTG", retailPrice: "2800.00", salePrice: null, minOrderQuantity: null, wholesaleEnabled: false, wholesaleTiers: [] }],
  variants: [], images: [], attributes: [], availability: "UNTRACKED_AVAILABLE", availableQuantity: null, createdAt: "2026-11-15T12:00:00Z",
};

export const pickupAvailable: PickupDto = {
  status: "available", unavailableMessage: null,
  location: { storeName: "Magasin test", addressLine: "1 rue Test", city: "Ville", region: "Ouest", country: "HT", phone: "+509 0000 0000", additionalLocationInfo: { fr: "", ht: "" }, schedule: [{ day: 1, open: true, from: "09:00", to: "17:00" }, { day: 9, open: true, from: "00:00", to: "00:00" }], closureInfo: { fr: "", ht: "" } },
  instructions: { general: { fr: "Apportez votre référence.", ht: "" } },
};

export const reservationView: ReservationViewDto = {
  id: "r1", reference: "ANA-K7M2QX", status: "PENDING_REVIEW", paymentStatus: "UNPAID", locale: "fr", createdAt: "2026-11-16T18:30:00Z", readyAt: null, expiresAt: null,
  contact: { firstName: "Marie", lastName: "Exemple", dialCode: "+509", phone: "3700 0000", email: "marie@example.test" },
  lines: [
    { productId: "p1", variantId: null, name: "Matelas", sku: "MAT-001", variantLabel: null, unit: "UNIT", quantity: 2, currency: "HTG", unitPrice: "25000.00", pricingKind: "RETAIL", tierMinQuantity: null, lineTotal: "50000.00" },
    { productId: "p1", variantId: null, name: "Matelas", sku: "MAT-001", variantLabel: null, unit: "UNIT", quantity: 5, currency: "USD", unitPrice: "165.00", pricingKind: "WHOLESALE", tierMinQuantity: 5, lineTotal: "825.00" },
  ],
  totals: [{ currency: "HTG", amount: "50000.00" }, { currency: "USD", amount: "825.00" }],
  balances: [{ currency: "HTG", total: "50000.00", paid: "0.00", due: "50000.00" }, { currency: "USD", total: "825.00", paid: "0.00", due: "825.00" }],
  pickup: { location: { storeName: "Magasin test", addressLine: "1 rue Test", city: "Ville", phone: "+509 0000 0000" }, instructions: {}, capturedAt: "2026-11-16T18:30:00Z", origin: "default" },
  canCancel: false,
  events: [{ type: "SUBMITTED", at: "2026-11-16T18:30:00Z", note: null, rejectReason: null, cancelledBy: null }],
};
