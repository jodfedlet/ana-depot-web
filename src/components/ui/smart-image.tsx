"use client";

import NextImage, { type ImageProps } from "next/image";
import { useState } from "react";

const FALLBACK = "/sample/placeholder.svg";

/**
 * next/image with two adaptations:
 *  - Remote product images (the API's public asset URLs, i.e. the configured R2 domain) and seller-uploaded data:/blob: URLs are served as they are
 *    (`unoptimized`). next/image would refuse any host that is not listed at BUILD time, and the asset domain is deployment configuration — it must not be hardcoded here.
 *  - An image that fails to load (deleted object, bad URL) is replaced by the neutral placeholder instead of a broken-image icon.
 */
export default function Image(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  const [failed, setFailed] = useState<string | null>(null);
  const external = /^(https?:|data:|blob:)/i.test(src);
  const shown = failed === src ? FALLBACK : props.src;
  return <NextImage {...props} src={shown} unoptimized={external || props.unoptimized} onError={(e) => { if (src && src !== FALLBACK) setFailed(src); props.onError?.(e); }} />;
}
