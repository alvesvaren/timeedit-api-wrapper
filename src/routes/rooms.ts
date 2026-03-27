import type { Context } from "hono";
import type { AuthVars } from "../middleware/auth.js";
import { fetchGroupRooms } from "../timeedit.js";
import type { Room } from "../schemas.js";

export async function listRoomsHandler(c: Context<{ Variables: AuthVars }>) {
  const sessionCookie = c.get("sessionCookie");
  try {
    const raw = await fetchGroupRooms(sessionCookie);
    const rooms: Room[] = raw.map((o) => {
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
    return c.json(rooms, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Failed to list rooms", detail: message }, 502);
  }
}
