/**
 * Domain entity types (`Room`, `Booking`, …) live in {@link ./entities.js}.
 * Route/body schemas compose those entities in {@link ./schemas.js}.
 */
export type {
  Booking,
  BookingInterval,
  CreatedBooking,
  Room,
  RoomCalendarSlot,
  RoomRef,
} from "./entities.js";
export type { CreateBookingInput } from "./schemas.js";
export { createBookingSchema } from "./schemas.js";
