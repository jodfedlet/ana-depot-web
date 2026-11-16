import type { ReactNode } from "react";

/** Page wrapper shared by every auth route (the block's `flex min-h-svh items-center justify-center` shell, adapted to the store layout). */
export function AuthShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">{children}</div>;
}
