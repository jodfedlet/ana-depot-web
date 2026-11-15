import NextImage, { type ImageProps } from "next/image";

/** next/image that also accepts seller-uploaded images (data: / blob: URLs), which cannot be optimized. */
export default function Image(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  const raw = src.startsWith("data:") || src.startsWith("blob:");
  return <NextImage {...props} unoptimized={raw || props.unoptimized} />;
}
