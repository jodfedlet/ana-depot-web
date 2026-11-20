import { type CatalogQuery, type SortKey } from "../catalog-types";
import { currencyDigits } from "../money";
import { anonymousApiClient } from "./client";
import type { CategoryDto, MeDto, PageDto, PickupDto, ProductDto, ProfileDto, ReservationViewDto } from "./dto";
import { ApiError, newIdempotencyKey } from "./http";
import { signedInClient } from "./session-client";

/**
 * Every storefront call to the Spring Boot API, one function per endpoint of `ana-depot-api/docs/api.md`. Nothing here invents an endpoint,
 * a field or a status; responses are returned as the wire DTOs and turned into view types by `map-catalog.ts` / `map-reservation.ts`.
 *
 * Public reads use the ANONYMOUS client (no token, see `client.ts`). Calls that act for a signed-in customer use the session token and fail
 * loudly when it is missing: they never fall back to a guest call.
 */
export { ApiError, newIdempotencyKey };

type Opts = { signal?: AbortSignal };

const notConfigured = () => new ApiError({ status: 0, code: "api_not_configured" });
function publicClient() {
  const c = anonymousApiClient();
  if (!c) throw notConfigured();
  return c;
}
/** Runs a call on the public client; a missing configuration is a REJECTED promise (never a synchronous throw), so hooks show an error state. */
const publicCall = async <T>(run: (client: NonNullable<ReturnType<typeof anonymousApiClient>>) => Promise<T>): Promise<T> => run(publicClient());

/** Calls made as the signed-in customer (see session-client.ts). */
const customerClient = signedInClient;

// ---- catalog ----------------------------------------------------------------------------------------------------------------------------------

export const listCategories = (o: Opts = {}) => publicCall((c) => c.get<CategoryDto[]>("/api/v1/categories", undefined, o));
export const getCategory = (slug: string, o: Opts = {}) => publicCall((c) => c.get<CategoryDto>(`/api/v1/categories/${encodeURIComponent(slug)}`, undefined, o));
export const getProduct = (idOrSlug: string, o: Opts = {}) => publicCall((c) => c.get<ProductDto>(`/api/v1/products/${encodeURIComponent(idOrSlug)}`, undefined, o));

/** Backend sort values: `relevance` (only meaningful with a text query), `newest`, `name`, `price-asc`, `price-desc` (the last two need a currency). */
export function backendSort(sort: SortKey | undefined, query: Pick<CatalogQuery, "q" | "currency">): string | undefined {
  if (!sort) return undefined; // the API's own default: relevance with a text query, newest without
  if (sort === "relevance") return query.q ? "relevance" : undefined;
  if (sort === "name-asc") return "name";
  if ((sort === "price-asc" || sort === "price-desc") && !query.currency) return undefined; // HTG and USD are never compared: no currency, no price order
  return sort;
}

const major = (minor: number, currency: string) => (minor / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency));

/** URL-level `CatalogQuery` (1-based pages, minor-unit prices) -> the API's query string parameters. */
export function toApiQuery(query: CatalogQuery, size: number): Record<string, string | number | boolean | string[] | undefined> {
  const priced = query.currency;
  return {
    q: query.q?.trim() || undefined,
    category: query.category,
    currency: query.currency,
    // price bounds only exist inside one currency (the API refuses them otherwise)
    minPrice: priced && query.minPrice !== undefined ? major(query.minPrice, priced) : undefined,
    maxPrice: priced && query.maxPrice !== undefined ? major(query.maxPrice, priced) : undefined,
    wholesale: query.wholesaleOnly ? true : undefined,
    inStock: query.inStockOnly ? true : undefined,
    attr: Object.entries(query.attributes ?? {}).flatMap(([key, values]) => values.map((v) => `${key}:${v}`)),
    brand: query.brands?.length ? query.brands : undefined,
    sort: backendSort(query.sort, query),
    page: Math.max(0, (query.page ?? 1) - 1),
    size,
  };
}

/** `GET /products` (with `q` it is the full-text search; the API ranks the results, the client never re-sorts them). */
export const searchProducts = (query: CatalogQuery, size: number, o: Opts = {}) =>
  publicCall((c) => c.get<PageDto<ProductDto>>(query.q?.trim() ? "/api/v1/products/search" : "/api/v1/products", toApiQuery(query, size), o));

export const getPickup = (o: Opts = {}) => publicCall((c) => c.get<PickupDto>("/api/v1/store/pickup", undefined, o));

// ---- reservations -----------------------------------------------------------------------------------------------------------------------------

export interface ReservationRequest {
  lines: { productId: string; variantId?: string; quantity: number; currency: string }[];
  contact: { firstName: string; lastName: string; dialCode: string; phone: string; email?: string };
  locale: string;
  acknowledgedTerms: boolean;
}

/**
 * `POST /reservations`. `idempotencyKey` is generated ONCE per submit attempt by the caller and reused for every retry of that attempt, so a
 * retry after a timeout can only return the original reservation, never create a second one. Prices are never sent: the server prices every line.
 */
export async function submitReservation(body: ReservationRequest, idempotencyKey: string, o: { signedIn: boolean } & Opts): Promise<ReservationViewDto> {
  const client = o.signedIn ? await customerClient() : publicClient();
  return client.post<ReservationViewDto>("/api/v1/reservations", body, { idempotencyKey, signal: o.signal });
}

/** `POST /reservations/lookup`: reference + phone in the BODY (never in a URL). Wrong credentials and unknown references are the same 404. */
export const lookupReservation = (reference: string, phone: string, o: Opts = {}) =>
  publicCall((c) => c.post<ReservationViewDto>("/api/v1/reservations/lookup", { reference, phone }, o));

/**
 * `POST /reservations/cancel` (D7): the customer cancels their own reservation until the store prepares it. Same ownership proof as the lookup (reference + phone in the BODY, an
 * identical 404 on any miss). The reason is required. The server answers with the updated reservation; nothing is shown as cancelled before that.
 */
export const cancelReservation = (reference: string, phone: string, reason: string, o: Opts = {}) =>
  publicCall((c) => c.post<ReservationViewDto>("/api/v1/reservations/cancel", { reference, phone, reason }, o));

// ---- customer account (token required) --------------------------------------------------------------------------------------------------------

export const getMe = async (o: Opts = {}) => (await customerClient()).get<MeDto>("/api/v1/me", undefined, o);
export const getProfile = async (o: Opts = {}) => (await customerClient()).get<ProfileDto>("/api/v1/me/profile", undefined, o);
export const saveProfile = async (body: { firstName: string; lastName: string; dialCode: string; phone: string; email?: string }, o: Opts = {}) =>
  (await customerClient()).put<ProfileDto>("/api/v1/me/profile", body, o);
export const listMyReservations = async (page: number, size: number, o: Opts = {}) =>
  (await customerClient()).get<PageDto<ReservationViewDto>>("/api/v1/me/reservations", { page, size }, o);
export const getMyReservation = async (id: string, o: Opts = {}) =>
  (await customerClient()).get<ReservationViewDto>(`/api/v1/me/reservations/${encodeURIComponent(id)}`, undefined, o);
