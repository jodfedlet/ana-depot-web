"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import Image from "@/components/ui/smart-image";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MoneyRows, MoneyText, Price, useUnitLabel } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/link";
import { useLocale, useT } from "@/i18n/provider";
import { lineTotal, sharedRoom } from "@/lib/cart";
import { unitPriceFor } from "@/lib/catalog/pricing";
import { useCartCheck } from "@/lib/api/cart-check";
import { formatMoney } from "@/lib/money";
import { useCart } from "@/lib/stores/cart-store";
import { useOnline } from "@/lib/pwa/store";

export function CartView() {
  const t = useT();
  const locale = useLocale();
  const unitLabel = useUnitLabel();
  const cart = useCart();
  const toast = useToast();
  const check = useCartCheck(cart.lines);
  const online = useOnline();
  const issues = check.issues;

  if (!cart.ready) return <CartSkeleton />;

  if (cart.lines.length === 0) {
    return (
      <EmptyState icon={<ShoppingBag aria-hidden />} title={t("cart.empty")} description={t("cart.emptyText")}>
        <ButtonLink href="/products">{t("cart.continueBrowsing")}</ButtonLink>
      </EmptyState>
    );
  }

  const blocked = Object.keys(issues).length > 0;
  const changed = Object.values(issues).some((i) => i.kind === "changed");
  const shortage = Object.values(issues).some((i) => i.kind === "unavailable" || i.kind === "insufficient");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
      <div>
        {cart.mixedCurrency && <Alert tone="info" title={t("cart.mixedTitle")} className="mb-4">{t("cart.mixedText")}</Alert>}
        {check.loading && !check.checked && <p role="status" className="text-caption mb-4 text-ink-soft">{t("cart.checking")}</p>}
        {!online && <Alert tone="warning" live="polite" className="mb-4">{t("pwa.cartOffline")}</Alert>}
        {online && check.error != null && <Alert tone="info" live="polite" className="mb-4">{t("cart.checkFailed")}</Alert>}
        {shortage && <Alert tone="warning" live="polite" title={t("cart.issuesTitle")} className="mb-4">{t("cart.issuesText")}</Alert>}
        {changed && (
          <Alert tone="warning" live="polite" title={t("cart.changedTitle")} className="mb-4">
            {t("cart.changedText")}
            <Button size="sm" variant="outline" className="mt-3" onClick={() => cart.replace(check.refreshed)}>{t("cart.updatePrices")}</Button>
          </Alert>
        )}
        <ul className="divide-y divide-line border-y border-line" aria-label={t("cart.items")}>
          {cart.lines.map((line) => {
            const issue = issues[line.key];
            const next = unitPriceFor(line.pricing, line.quantity).next;
            const room = sharedRoom(cart.lines, { ...line, maxQuantity: issue?.kind === "insufficient" ? issue.available : line.maxQuantity });
            const max = room === undefined ? undefined : Math.max(line.pricing.minQty, room);
            return (
              <li key={line.key} className="grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-3 py-5 sm:grid-cols-[7rem_1fr_auto]">
                <Link href={`/products/${line.slug}`} className="relative block aspect-square overflow-hidden rounded-control bg-sand-100">
                  <Image src={line.image.src} alt={line.image.alt} fill sizes="112px" className="object-cover" />
                </Link>
                <div className="min-w-0">
                  <h2 className="text-h3"><Link href={`/products/${line.slug}`} className="hover:underline underline-offset-2">{line.name}</Link></h2>
                  {line.variantLabel && <p className="text-caption mt-0.5 text-ink-soft">{line.variantLabel}</p>}
                  <Price price={line.unitPrice} compareAt={line.priceKind !== "retail" && line.pricing.retail > line.unitPrice.amount ? { amount: line.pricing.retail, currency: line.unitPrice.currency } : undefined} unit={line.unit} size="sm" className="mt-1.5" />
                  {line.priceKind === "wholesale" && <Badge tone="accent" className="mt-2">{t("pricing.wholesaleApplied")}</Badge>}
                  {next && next.saving > 0 && (
                    <p className="text-caption mt-2 text-accent-700">{t("pricing.addMore", { more: next.moreNeeded, unit: unitLabel(line.unit, next.moreNeeded), price: formatMoney({ amount: next.unitPrice, currency: line.pricing.currency }, locale) })}</p>
                  )}
                  {line.pricing.minQty > 1 && <p className="text-caption mt-1 text-ink-muted">{t("pricing.minOrder", { qty: line.pricing.minQty, unit: unitLabel(line.unit, line.pricing.minQty) })}</p>}
                  {issue?.kind === "unavailable" && <p role="alert" className="text-caption mt-2 font-medium text-danger-fg">{t("cart.lineUnavailable")}</p>}
                  {issue?.kind === "changed" && <p role="alert" className="text-caption mt-2 font-medium text-warning-fg">{t("cart.lineChanged", { before: formatMoney(issue.before, locale), after: formatMoney(issue.after, locale) })}</p>}
                  {issue?.kind === "insufficient" && <p role="alert" className="text-caption mt-2 font-medium text-danger-fg">{t("cart.lineInsufficient", { count: issue.available, unit: unitLabel(line.unit, issue.available) })}</p>}
                </div>
                <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between">
                  <QuantityStepper size="sm" label={t("cart.qtyOf", { name: line.name })} value={line.quantity} min={line.pricing.minQty} max={max} onChange={(q) => cart.setQuantity(line.key, q)} />
                  <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                    <p className="text-price text-[1.0625rem]"><span className="sr-only">{t("cart.lineTotal")}</span><MoneyText value={lineTotal(line)} /></p>
                    <button type="button" onClick={() => { cart.remove(line.key); toast.show({ tone: "info", message: t("cart.removedToast", { name: line.name }) }); }} className="text-caption inline-flex min-h-9 items-center gap-1.5 font-medium text-ink-soft hover:text-danger-fg" aria-label={t("cart.removeNamed", { name: line.name })}>
                      <Trash2 aria-hidden className="size-4" /> {t("cart.remove")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <ButtonLink href="/products" variant="ghost" className="mt-4 -ml-2">← {t("cart.continueBrowsing")}</ButtonLink>
      </div>

      <aside aria-labelledby="summary-title" className="h-fit rounded-card border border-line bg-surface p-5 lg:sticky lg:top-40">
        <h2 id="summary-title" className="text-h3 mb-4">{t("cart.summary")}</h2>
        {cart.subtotals.length > 0 && <MoneyRows label={t("cart.subtotal")} totals={cart.subtotals} className="text-label font-normal text-ink-soft" valueClassName="text-h3 text-ink" />}
        <p className="text-caption mt-3 text-ink-muted">{t("cart.note")}</p>
        <ButtonLink href="/reserve" size="lg" full className="mt-5" aria-disabled={blocked || !online || undefined} tabIndex={blocked || !online ? -1 : undefined}>{t("cart.reserve")}</ButtonLink>
        {!online && <p className="text-caption mt-2 text-center font-medium text-warning-fg">{t("pwa.reserveOffline")}</p>}
        <p className="text-caption mt-3 text-center font-medium text-ink">{t("cart.noOnlinePayment")}</p>
        <p className="text-caption mt-1 text-center text-ink-soft">{t("cart.guest")}</p>
      </aside>
    </div>
  );
}

function CartSkeleton() {
  const t = useT();
  return (
    <div role="status" aria-label={t("cart.loading")} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-5">{[0, 1].map((i) => <div key={i} className="flex gap-4"><Skeleton className="size-24" /><div className="flex-1 space-y-3"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-1/4" /></div></div>)}</div>
      <Skeleton className="h-56" />
      <span className="sr-only">{t("cart.loading")}</span>
    </div>
  );
}
