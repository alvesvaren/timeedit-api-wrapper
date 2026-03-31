/**
 * Shared exports for application code; entities live in {@link ./entities.js}.
 */
export type {
  BookingInterval,
  CreatedBooking,
  MyBooking,
  ReservationSlot,
  Room,
  RoomAttributes,
  RoomCalendarSlot,
} from "./entities.js";
export type { CreateBookingInput } from "./schemas.js";
export { createBookingSchema } from "./schemas.js";
