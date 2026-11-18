import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PaymentCapabilitiesProvider } from "@/lib/api/payment-capabilities";

export default function StoreLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <PaymentCapabilitiesProvider>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </PaymentCapabilitiesProvider>
  );
}
