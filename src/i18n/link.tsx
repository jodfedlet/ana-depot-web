"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { localizeHref } from "./navigation";
import { useLocale } from "./provider";

/** Drop-in replacement for next/link: pass locale-less hrefs ("/products"); the current locale is added. */
export function Link({ href, ...props }: Omit<ComponentProps<typeof NextLink>, "href"> & { href: string }) {
  const locale = useLocale();
  return <NextLink href={localizeHref(href, locale)} {...props} />;
}
