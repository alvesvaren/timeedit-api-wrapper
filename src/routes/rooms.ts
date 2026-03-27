import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import { fetchGroupRooms } from "../timeedit.js";
import type { Room } from "../schemas.js";

/** Raw rows from TimeEdit `objects.json` (type 4 / group rooms). */
export type GroupRoomObject = Awaited<ReturnType<typeof fetchGroupRooms>>[number];

export function mapGroupRoomObjects(raw: GroupRoomObject[]): Room[] {
  return raw.map((o) => {
    const f = o.fields ?? {};
    const capRaw = f["Lokalstorlek"]?.trim();
    const capacity = capRaw ? Number.parseInt(capRaw, 10) : null;
    return {
      id: o.id,
      name: f["Lokalnamn"]?.trim() ?? o.id,
      equipment: f["Utrustning"]?.trim() ?? "",
      campus: f["Campus"]?.trim() ?? "",
      capacity: Number.isFinite(capacity) ? capacity : null,
    };
  });
}

export async function listRoomsHandler(c: Context<{ Variables: AuthVars }>) {
  const sessionCookie = c.get("sessionCookie");
  try {
    const raw = await fetchGroupRooms(sessionCookie);
    const rooms = mapGroupRoomObjects(raw);
    return c.json(rooms, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Failed to list rooms", detail: message }, 502);
  }
}
