import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentCancelledView } from "@/features/payments/payment-cancelled";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PaymentCancelledPage() {
  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <Suspense><PaymentCancelledView /></Suspense>
    </div>
  );
}
