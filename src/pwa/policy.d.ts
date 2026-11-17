export type RequestClass = "bypass" | "shell" | "static" | "page" | "private-page" | "api" | "image";
export type CacheKind = "shell" | "static" | "pages" | "api" | "images";

export interface ClassifyInput {
  url: string;
  method: string;
  mode?: string;
  destination?: string;
  hasAuthorization?: boolean;
  hasRange?: boolean;
  origin: string;
  apiOrigin: string | null;
  assetOrigins?: string[];
}
export interface CacheableInput {
  kind: RequestClass;
  status: number;
  type: string;
  redirected?: boolean;
  cacheControl?: string | null;
}

export const SHELL_FILES: string[];
export const LOCALES: string[];
export const KINDS: CacheKind[];
export const PRIVATE_KINDS: CacheKind[];
export const MAX_ENTRIES: Record<CacheKind, number>;
export const API_MAX_AGE_MS: number;
export const NETWORK_TIMEOUT_MS: number;
export function cacheName(version: string, kind: CacheKind): string;
export function isObsoleteCache(name: string, version: string): boolean;
export function localeOf(pathname: string): string | null;
export function isPrivatePath(pathname: string): boolean;
export function isPublicPage(pathname: string): boolean;
export function classify(input: ClassifyInput): RequestClass;
export function isCacheable(input: CacheableInput): boolean;
export function isTooOld(storedAt: unknown, now: number): boolean;
export function keyOf(url: string): string;
export function fallbackKeys(url: string, acceptLanguage?: string | null): string[];
export function extractStaticUrls(html: string): string[];
export function purgeNames(version: string): string[];
