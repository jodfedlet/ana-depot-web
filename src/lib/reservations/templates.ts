import { L, type LText } from "../localized";
import type { RejectReason } from "./types";

/**
 * Starting points for customer-visible notes. They are LText because the note must be written
 * in the CUSTOMER's language, which can differ from the staff member's interface language.
 * Staff can edit the text before sending.
 */
export const noteTemplates = {
  accept: L(
    "Votre réservation est acceptée. Nous vous préviendrons lorsque vos produits seront prêts à être retirés.",
    "Nou aksepte rezèvasyon w lan. N ap fè w konnen lè pwodwi w yo pare pou w vin pran yo.",
  ),
  ready: L(
    "Vos produits sont prêts. Vous pouvez passer au magasin avec votre référence de réservation.",
    "Pwodwi w yo pare. Ou ka pase nan magazen an ak referans rezèvasyon w lan.",
  ),
  contactBeforeVisit: L("Merci de contacter le magasin avant de vous déplacer.", "Tanpri kontakte magazen an anvan w deplase."),
  pickupChanged: L(
    "Le lieu de retrait de votre réservation a changé. Merci de consulter la nouvelle adresse avant de vous déplacer.",
    "Kote w ap vin pran rezèvasyon w lan chanje. Tanpri gade nouvèl adrès la anvan w deplase.",
  ),
  cancelled: L("Votre réservation a été annulée par le magasin.", "Magazen an anile rezèvasyon w lan."),
  rejected: {
    product_unavailable: L("Désolé, un ou plusieurs produits ne sont plus disponibles.", "Padon, youn oswa plizyè pwodwi pa disponib ankò."),
    incorrect_product_info: L("Nous ne pouvons pas traiter cette réservation : une information sur un produit est incorrecte.", "Nou pa ka trete rezèvasyon sa a: gen yon enfòmasyon sou yon pwodwi ki pa kòrèk."),
    quantity_unavailable: L("Désolé, la quantité demandée n'est pas disponible.", "Padon, kantite w mande a pa disponib."),
    cannot_fulfill: L("Désolé, nous ne pouvons pas honorer cette réservation.", "Padon, nou pa ka satisfè rezèvasyon sa a."),
    other: L("", ""),
  } satisfies Record<RejectReason, LText>,
};
