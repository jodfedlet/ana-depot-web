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

## Payment messaging (capability-aware wording; `ht/store.ts`, `ht/customer.ts`, `ht/seo.ts`, `ht/admin-ops.ts`)
NATIVE REVIEW REQUIRED. Written by the assistant from the agreed French copy (no Creole text was supplied). Two variants exist for each sentence that depends on payment availability: the plain one (pay at the store only) and a `...Both` one (card online or at the store).
Keys: `announcement.message/messageBoth/messageClosed`, `home.benefits.reserveText/payTitle/payText/payTitleBoth/payTextBoth/wholesaleText/trackText`, `cart.noOnlinePayment(Both)`, `product.payAtStore(Both)`, `info.howSteps.s2/s5(Both)/payments(Both)`,
`reserve.pickup.payIntro(Both)/cardName/cardDesc/cardWhenReady`, `reserve.review.t4(Both)`, `reserve.confirmation.n4(Both)`, `track.detail.payAtStore(Both)`, `statusDescription.ready_for_pickup`, `onlinePay.atPickupText/temporarilyUnavailable`, `seo.infoHowDescription`, `admin.*.paymentsText`.
Points for the reviewer: "peye ak kat" vs "peye sou entènèt ak kat" (pay by card / pay online by card); "Peye jan w vle" (Pay as you wish) as the title of the combined option; "disponib" vs "ki disponib yo" ("depending on available options"); whether "magazen an" or "boutik la" is preferred in customer text (the admin text uses "boutik").
