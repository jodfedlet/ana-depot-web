/**
 * SAMPLE DATA — placeholder pickup configuration.
 * The real store address, hours, telephone and policies have NOT been provided. Everything
 * below is obviously fake ("exemple") and exists only to demonstrate the screens. The
 * administrator replaces it in Admin → Pickup settings.
 */
import { L, emptyLText } from "../localized";
import type { DaySchedule, PickupChange, PickupLocation, PickupSettings } from "../pickup/types";

const weekdays = (from: string, to: string): DaySchedule[] => [
  { day: 1, open: true, from, to },
  { day: 2, open: true, from, to },
  { day: 3, open: true, from, to },
  { day: 4, open: true, from, to },
  { day: 5, open: true, from, to },
  { day: 6, open: true, from: "09:00", to: "13:00" },
  { day: 7, open: false, from: "09:00", to: "13:00" },
];

export const sampleLocation: PickupLocation = {
  storeName: "Ana Dépôt (exemple)",
  addressLine: "00, rue Exemple",
  city: "Ville Exemple",
  region: "Département Exemple",
  country: "HT",
  postalCode: undefined,
  phone: "+509 0000 0000",
  email: "contact@example.com",
  additionalLocationInfo: L(
    "Adresse d'exemple : à remplacer par l'adresse réelle du magasin.",
    "Adrès egzanp: ranplase l ak vrè adrès magazen an.",
  ),
  schedule: weekdays("09:00", "17:00"),
  closureInfo: emptyLText(),
};

/** The address used before the (sample) relocation, kept by older reservations. */
export const previousSampleLocation: PickupLocation = {
  ...sampleLocation,
  addressLine: "12, rue Ancienne (exemple)",
  city: "Ancienne Ville (exemple)",
  additionalLocationInfo: L("Ancienne adresse d'exemple.", "Ansyen adrès egzanp."),
};

export const sampleInstructions = {
  general: L(
    "Présentez-vous au magasin avec votre référence de réservation. Le paiement se fait sur place, en espèces.",
    "Prezante w nan magazen an ak referans rezèvasyon w lan. Peman an fèt sou plas, an lajan kach.",
  ),
  contact: L("Pour toute question, contactez le magasin avant de vous déplacer.", "Si w gen kesyon, kontakte magazen an anvan w deplase."),
  accepted: L(
    "Votre réservation est acceptée. Nous vous préviendrons dès que vos produits seront prêts : ne vous déplacez pas avant.",
    "Nou aksepte rezèvasyon w lan. N ap fè w konnen le pwodwi w yo pare: pa deplase anvan.",
  ),
  ready: L(
    "Vos produits sont prêts. Passez au magasin avec votre référence et préparez le paiement en espèces.",
    "Pwodwi w yo pare. Pase nan magazen an ak referans ou epi prepare lajan kach pou peman an.",
  ),
  // The business has not provided a pickup policy; none is invented.
  policy: emptyLText(),
};

export const samplePickupSettings: PickupSettings = {
  enabled: true,
  unavailableMessage: L(
    "Le retrait en magasin est temporairement indisponible. Merci de réessayer plus tard.",
    "Retrè nan magazen an pa disponib pou kounye a. Tanpri eseye ankò pita.",
  ),
  location: sampleLocation,
  instructions: sampleInstructions,
  // No expiration policy is configured until the business decides one.
  holdPeriodDays: null,
  updatedAt: "2026-11-05T10:00:00Z",
  updatedBy: "Personnel exemple",
};

export const samplePickupHistory: PickupChange[] = [
  {
    id: "chg-1",
    at: "2026-11-05T10:00:00Z",
    by: "Personnel exemple",
    before: { ...samplePickupSettings, location: previousSampleLocation, updatedAt: "2026-10-01T09:00:00Z" },
    after: samplePickupSettings,
    changed: ["address"],
  },
];
