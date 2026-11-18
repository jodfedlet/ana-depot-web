"use client";

import { MapPin, Wallet } from "lucide-react";
import { useUnitLabel } from "@/components/ui/price";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import type { Product } from "@/lib/catalog-types";
import { usePickupView } from "@/lib/api/pickup-hooks";
import { useCardOffered } from "@/lib/api/payment-capabilities";

const section = "border-t border-line py-5";

/** Description, specifications (built from the category's attributes) and a short pickup/payment note. */
export function ProductDetails({ product }: { product: Product }) {
  const t = useT();
  const cardOffered = useCardOffered();
  const unitLabel = useUnitLabel();
  const { view } = usePickupView();
  const loc = view?.status === "available" ? view.location : null;
  const rows = [
    { label: t("product.skuLabel"), value: product.sku },
    { label: t("product.unitLabel"), value: unitLabel(product.unit, 1) + (product.unitNote ? ` — ${product.unitNote}` : "") },
    ...product.specifications,
  ].filter((r) => r.value);
  return (
    <div>
      {product.description.length > 0 && (
        <section className={section} aria-labelledby="desc-title">
          <h2 id="desc-title" className="text-h3">{t("product.description")}</h2>
          <div className="text-body mt-2 space-y-3 text-ink-soft">{product.description.map((p, i) => <p key={i}>{p}</p>)}</div>
        </section>
      )}

      <section className={section} aria-labelledby="spec-title">
        <h2 id="spec-title" className="text-h3">{t("product.specifications")}</h2>
        <dl className="mt-3 divide-y divide-line">
          {rows.map((s) => (
            <div key={s.label} className="text-label grid grid-cols-[8rem_1fr] gap-3 py-2.5 sm:grid-cols-[10rem_1fr]">
              <dt className="font-normal text-ink-soft">{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={section} aria-labelledby="pickup-title">
        <h2 id="pickup-title" className="text-h3">{t("product.pickupAndPayment")}</h2>
        <ul className="mt-3 space-y-3">
          <li className="flex gap-3">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <p className="text-label font-normal text-ink-soft">{loc ? <><span className="font-semibold text-ink">{loc.storeName}</span> — {loc.addressLine}, {loc.city}</> : t("product.pickupSoon")}</p>
          </li>
          <li className="flex gap-3">
            <Wallet aria-hidden className="mt-0.5 size-5 shrink-0 text-brand-700" />
            <p className="text-label font-normal text-ink-soft">{t(cardOffered ? "product.payAtStoreBoth" : "product.payAtStore")}</p>
          </li>
        </ul>
        <p className="text-caption mt-3 text-ink-muted">{t("product.needsApproval")} <Link href="/info/how-it-works" className="font-semibold text-brand-700 underline underline-offset-2">{t("announcement.link")}</Link></p>
      </section>
    </div>
  );
}
