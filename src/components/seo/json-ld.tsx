import { jsonLdString } from "@/lib/seo/jsonld";

/**
 * One JSON-LD block. This is the ONLY place the app uses `dangerouslySetInnerHTML`, and it is safe by construction: `jsonLdString` serializes with JSON.stringify and escapes
 * `<`, `>` and `&`, so text coming from the catalog can never close the script tag or inject markup.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
