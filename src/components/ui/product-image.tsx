import Image from "@/components/ui/smart-image";
import { cn } from "@/lib/cn";
import type { ProductImage as ProductImageData } from "@/lib/catalog-types";

/** Square product image on a neutral backdrop. `sizes` must reflect the real rendered width. */
export function ProductImage({
  image,
  sizes,
  priority = false,
  className,
}: {
  image: ProductImageData;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden bg-sand-100", className)}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="object-cover"
      />
    </div>
  );
}
