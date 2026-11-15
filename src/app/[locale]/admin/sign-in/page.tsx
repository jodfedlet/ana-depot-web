import { Suspense } from "react";
import { AdminSignIn } from "@/features/admin/admin-signin";

async function Content({ searchParams }: Pick<PageProps<"/[locale]/admin/sign-in">, "searchParams">) {
  const { status } = await searchParams;
  return <AdminSignIn status={status === "expired" || status === "signed_out" ? status : undefined} />;
}

export default function Page(props: PageProps<"/[locale]/admin/sign-in">) {
  return <Suspense><Content searchParams={props.searchParams} /></Suspense>;
}
