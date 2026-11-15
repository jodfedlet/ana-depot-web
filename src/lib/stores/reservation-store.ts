"use client";

import { sampleReservations } from "../mock/reservations";
import type { Reservation } from "../reservations/types";
import { createPersistedStore } from "./create-persisted-store";

/**
 * DEMO DATABASE — reservations live in this browser's localStorage so the customer and
 * administration screens can show one consistent lifecycle. It is NOT persistence: nothing
 * is sent anywhere. The Spring Boot API replaces it; screens only talk to `lib/api/reservations`.
 */
export const reservationStore = createPersistedStore<Reservation[]>("ana.demo.reservations.v3", sampleReservations);
export const useReservations = () => reservationStore.useStore();
