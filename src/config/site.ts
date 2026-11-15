/** Store identity and navigation. Labels are message keys (see src/i18n/messages). */
export const siteConfig = {
  name: "Ana Dépôt",
  /** Optional announcement bar. Set to false to hide it. */
  showAnnouncement: true,
  announcementHref: "/info/how-it-works",
} as const;

/** Information pages. `live` pages render the current pickup configuration; others are placeholders for business content. */
export const infoPages = {
  "how-it-works": { key: "info.howItWorks", kind: "how" },
  pickup: { key: "info.pickup", kind: "pickup" },
  contact: { key: "info.contact", kind: "pickup" },
  returns: { key: "info.returns", kind: "placeholder" },
  privacy: { key: "info.privacy", kind: "placeholder" },
  terms: { key: "info.terms", kind: "placeholder" },
} as const;
export type InfoPageSlug = keyof typeof infoPages;
