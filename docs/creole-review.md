# Haitian Creole strings awaiting native-speaker review

Every `ht` string is written carefully but **no native speaker has reviewed them yet** (README, "Decisions needed"). Strings below were supplied as an *initial translation* and are
specifically flagged in code with `NATIVE REVIEW REQUIRED`. Review before production.

## Homepage hero (`src/i18n/messages/ht/store.ts`, `home.hero.*`)
| Key | Text |
|---|---|
| eyebrow | FÈ REZÈVASYON SOU ENTÈNÈT · VIN RANMSE NAN MAGAZEN AN |
| title | Tout sa w bezwen. Nan kèk klik sèlman. |
| description | Dekouvri anpil kalite pwodwi, fè rezèvasyon w fasil sou entènèt epi vin pran kòmann ou nan magazen an. Achte an detay oswa an gwo, selon sa ki disponib. |
| primary | Dekouvri pwodwi yo |
| secondary | Gade kategori yo |

Points for the reviewer: "kòmann" (here) vs "kòmand" used elsewhere in the app for *order/reservation* — pick one spelling; "rezèvasyon" vs "rezève" used elsewhere; "an detay / an gwo" for retail/wholesale.

## Online payment with Stripe (`ht/customer.ts` `onlinePay.*`, `paymentMethod.stripe_checkout`, `reserve.pickup.payIntro`; `ht/api.ts` online payment codes; `ht/admin-live.ts` `adminPay.*`; `ht/store.ts` `cart.noOnlinePayment`, `product.payAtStore`, FAQ payments)
NATIVE REVIEW REQUIRED. Wording given by the business owner (used as supplied): "Peye lè w vin pran kòmann lan", "Peye sou entènèt", "Peman an sekirite ak Stripe", "Peman an pa fini",
"Rezèvasyon ou a toujou la", "N ap verifye peman an", "Peman an konfime". Everything else in these groups was written by the assistant and is unreviewed: confirmation / failure /
expiry sentences, the explanation that each currency is paid separately, the staff notes (no refund, do not mark as paid), and the reworded "you are not asked to pay now" lines that
replaced the former "no online payment" statements (those would be false once Stripe is switched on).
Points for the reviewer: "kòmann" (as supplied in the pay-at-pickup label) vs "kòmand" elsewhere; "debite" (to debit), "ranbousman" (refund), "tantativ" (attempt), "sesyon" (session).
