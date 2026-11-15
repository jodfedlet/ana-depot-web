"use client";

import { seedCategories, seedMovements, seedProducts } from "../mock/catalog-seed";
import type { CategoryRecord, ProductRecord, StockMovement } from "../catalog/model";
import { createPersistedStore } from "./create-persisted-store";

export interface CatalogState { categories: CategoryRecord[]; products: ProductRecord[]; movements: StockMovement[] }

export const seedCatalog = (): CatalogState => ({ categories: structuredClone(seedCategories), products: structuredClone(seedProducts), movements: seedMovements() });

/**
 * DEMO catalog database (browser localStorage). The storefront and the administration both read it, so a product
 * the seller registers really appears to customers. NOT persistence: the Spring Boot API replaces it.
 */
export const catalogStore = createPersistedStore<CatalogState>("ana.demo.catalog.v2", seedCatalog());
export const useCatalogState = () => catalogStore.useStore();
