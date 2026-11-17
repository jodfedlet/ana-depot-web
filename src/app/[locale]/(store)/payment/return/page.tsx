import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentReturnView } from "@/features/payments/payment-return";

// Private, per-visitor state: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PaymentReturnPage() {
  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <Suspense><PaymentReturnView /></Suspense>
    </div>
  );
}
