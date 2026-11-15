"use client";

import { Badge } from "@/components/ui/badge";
import { Price, useUnitLabel } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Link } from "@/i18n/link";
import { useT } from "@/i18n/provider";
import type { Product } from "@/lib/catalog-types";
import { discountPercent } from "@/lib/money";
import { displayPrice, hasVariants } from "@/lib/product";
import { QuickAdd } from "./quick-add";

export const CARD_IMAGE_SIZES = "(min-width:1280px) 22vw, (min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw";

/** Every optional field (compare price, rating, badge, availability) may be absent. */
export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const t = useT();
  const unitLabel = useUnitLabel();
  const { price, from } = displayPrice(product);
  const firstTier = product.hasWholesale ? [...product.pricing.wholesale.tiers].sort((a, b) => a.minQty - b.minQty)[0] : undefined;
  const pct = discountPercent(product.price, product.compareAtPrice);
  const soldOut = product.availability === "out_of_stock";
  const showAvailability = product.availability === "low_stock" || product.availability === "preorder";

  return (
    <article className="group relative flex h-full flex-col">
      <div className="relative overflow-hidden rounded-card">
        <ProductImage image={product.images[0]} sizes={CARD_IMAGE_SIZES} priority={priority} className="transition-transform duration-300 group-hover:scale-[1.03]" />
        <div className="absolute left-2 top-2 flex flex-col items-start gap-1.5">
          {pct > 0 && <Badge tone="accent">{t("product.off", { pct })}</Badge>}
          {product.isNew && <Badge tone="brand">{t("product.new")}</Badge>}
        </div>
        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-canvas/55">
            <Badge className="bg-surface text-ink shadow-card">{t("product.soldOut")}</Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col pt-3">
        {product.brand && <p className="text-caption text-ink-muted">{product.brand}</p>}
        <h3 className="text-h3 mt-0.5">
          {/* Stretched link: the whole card is clickable; the Add button sits above it */}
          <Link href={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] hover:underline underline-offset-2">
            {product.name}
          </Link>
        </h3>
        <Price price={price} compareAt={from ? undefined : product.compareAtPrice} from={from} unit={product.unit} className="mt-1.5" />
        {firstTier && <p className="text-caption mt-1 font-medium text-accent-700">{t("pricing.wholesaleFrom", { qty: firstTier.minQty, unit: unitLabel(product.unit, firstTier.minQty) })}</p>}
        {showAvailability && <p className="text-caption mt-1 font-medium text-warning-fg">{t(`availability.${product.availability}`)}</p>}
        <div className="relative z-10 mt-auto pt-3">
          <QuickAdd product={product} withOptions={hasVariants(product)} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:gap-x-6 xl:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <div className="flex w-full flex-col">
            <ProductCard product={p} priority={i < priorityCount} />
          </div>
        </li>
      ))}
    </ul>
  );
}
