"use client";

import { ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyText, Price, useUnitLabel } from "@/components/ui/price";
import { PriceTiersTable } from "@/components/ui/price-tiers";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { useToast } from "@/components/ui/toast";
import { useLocaleRouter } from "@/i18n/navigation";
import { formatMoney } from "@/lib/money";
import { useLocale, useT } from "@/i18n/provider";
import { buildCartLine } from "@/lib/cart";
import { snapshotFor, unitPriceFor } from "@/lib/catalog/pricing";
import type { Product } from "@/lib/catalog-types";
import { availabilityTone, findVariant, hasVariants } from "@/lib/product";
import { useCart } from "@/lib/stores/cart-store";
import { OptionPicker } from "./option-picker";
import { ProductGallery } from "./product-gallery";

function initialSelection(product: Product): Record<string, string> {
  if (!hasVariants(product)) return {};
  const first = product.variants.find((v) => v.availability !== "out_of_stock") ?? product.variants[0];
  return { ...first.optionValues };
}

/**
 * Gallery + purchase panel. The unit price follows the chosen quantity (retail → wholesale tiers) and the total
 * updates live. Static sections (description, specs, pickup) arrive as `children`.
 */
export function ProductExperience({ product, children }: { product: Product; children: ReactNode }) {
  const t = useT();
  const unitLabel = useUnitLabel();
  const router = useLocaleRouter();
  const locale = useLocale();
  const cart = useCart();
  const toast = useToast();
  const [selection, setSelection] = useState(() => initialSelection(product));
  const [quantityRaw, setQuantity] = useState(product.minOrderQty);
  const [imageIndex, setImageIndex] = useState(() => findVariant(product, initialSelection(product))?.imageIndex ?? 0);
  const [stickyVisible, setStickyVisible] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  const variant = hasVariants(product) ? findVariant(product, selection) : undefined;
  const snap = useMemo(() => snapshotFor(product.pricing, variant?.price?.amount), [product.pricing, variant]);
  const availability = variant?.availability ?? product.availability;
  const maxQty = variant?.availableQty ?? product.availableQty;
  const canBuy = availability !== "out_of_stock" && (!hasVariants(product) || !!variant) && (maxQty === undefined || maxQty >= snap.minQty);
  const quantity = Math.max(snap.minQty, Math.min(maxQty ?? 99999, quantityRaw));
  const up = unitPriceFor(snap, quantity);
  const currency = product.price.currency;
  const total = { amount: up.unitPrice * quantity, currency };

  useEffect(() => {
    const el = addRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const select = (name: string, value: string) => {
    const next = { ...selection, [name]: value };
    setSelection(next);
    const match = findVariant(product, next);
    if (match?.imageIndex !== undefined) setImageIndex(match.imageIndex);
    setQuantity(Math.max(1, product.minOrderQty));
  };

  const add = () => {
    if (!canBuy) return false;
    cart.add(buildCartLine(product, variant, quantity));
    return true;
  };
  const addAndNotify = () => {
    if (add()) toast.show({ tone: "success", message: t("product.addedQty", { qty: quantity, unit: unitLabel(product.unit, quantity), name: product.name }), action: { label: t("product.viewCart"), href: "/cart" } });
  };
  const reserveNow = () => { if (add()) router.push("/reserve"); };

  const addLabel = availability === "out_of_stock" ? t("product.outOfStock") : t("product.addToCart");
  const showCompare = up.kind === "sale" ? snap.retail : up.kind === "wholesale" && snap.retail > up.unitPrice ? snap.retail : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-14">
      <ProductGallery images={product.images} index={imageIndex} onIndexChange={setImageIndex} />

      <div>
        {product.brand && <p className="text-eyebrow text-ink-muted">{product.brand}</p>}
        <h1 className="text-h1 mt-1">{product.name}</h1>
        <p className="text-caption mt-1 text-ink-muted">{t("product.sku", { sku: variant?.sku || product.sku })}</p>

        <div className="mt-4">
          <Price price={{ amount: up.unitPrice, currency }} compareAt={showCompare ? { amount: showCompare, currency } : undefined} unit={product.unit} size="lg" />
          {product.unitNote && <p className="text-caption mt-0.5 text-ink-soft">{product.unitNote}</p>}
          {up.kind === "wholesale" && <Badge tone="accent" className="mt-2">{t("pricing.wholesaleApplied")}</Badge>}
        </div>

        {hasVariants(product) && <div className="mt-6"><OptionPicker product={product} selection={selection} onSelect={select} /></div>}

        <div className="mt-5 flex flex-wrap items-center gap-2" aria-live="polite">
          <Badge tone={availabilityTone[availability]}>{t(`availability.${availability}`)}</Badge>
          {maxQty !== undefined && availability !== "out_of_stock" && <span className="text-caption text-ink-soft">{t("pricing.available", { count: maxQty, unit: unitLabel(product.unit, maxQty) })}</span>}
          {availability === "preorder" && <span className="text-caption text-ink-soft">{t("product.preorderNote")}</span>}
        </div>

        {snap.tiers.length > 0 && (
          <div className="mt-5 rounded-card border border-line bg-surface p-4">
            <PriceTiersTable snapshot={snap} unit={product.unit} quantity={quantity} />
          </div>
        )}
        {snap.minQty > 1 && <p className="text-caption mt-3 font-medium text-ink">{t("pricing.minOrder", { qty: snap.minQty, unit: unitLabel(product.unit, snap.minQty) })}</p>}

        <div ref={addRef} className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} min={snap.minQty} max={maxQty} />
            <p className="text-label font-normal text-ink-soft" aria-live="polite">
              {t("pricing.total")} : <span className="text-h3 text-ink"><MoneyText value={total} /></span>
            </p>
          </div>
          {up.next && up.next.saving > 0 && (
            <p role="status" className="text-label rounded-control bg-accent-100 px-3 py-2 font-normal text-accent-700">
              {t("pricing.addMore", { more: up.next.moreNeeded, unit: unitLabel(product.unit, up.next.moreNeeded), price: formatMoney({ amount: up.next.unitPrice, currency }, locale) })}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" className="min-w-52 flex-1" disabled={!canBuy} onClick={addAndNotify}>
              <ShoppingBag aria-hidden className="size-5" />
              {addLabel}
            </Button>
            <Button size="lg" variant="outline" className="flex-1" disabled={!canBuy} onClick={reserveNow}>{t("product.reserveNow")}</Button>
          </div>
          <p className="text-caption text-ink-soft">{t("product.payAtStore")}</p>
        </div>

        <div className="mt-8">{children}</div>
      </div>

      {/* Mobile sticky purchase bar */}
      <div
        aria-hidden={!stickyVisible}
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-float backdrop-blur transition-transform lg:hidden ${stickyVisible ? "translate-y-0" : "translate-y-full"}`}
        inert={!stickyVisible}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-label truncate">{product.name}</p>
            <p className="text-caption text-ink-soft">{quantity} × <MoneyText value={{ amount: up.unitPrice, currency }} /> = <MoneyText value={total} /></p>
          </div>
          <Button disabled={!canBuy} onClick={addAndNotify}>{addLabel}</Button>
        </div>
      </div>
    </div>
  );
}
