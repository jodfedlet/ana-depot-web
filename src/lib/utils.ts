import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * shadcn/ui's `cn` helper (https://ui.shadcn.com/docs/installation/manual), required by the registry components in `components/auth-block/ui/`.
 * The rest of the app keeps using `lib/cn.ts`; this one exists because the registry files import `@/lib/utils` and rely on tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
