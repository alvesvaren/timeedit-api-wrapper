import { afterEach, describe, expect, test, vi } from "vitest";
import { cancelBooking } from "../timeedit.js";

function stubTimeEditResponse(body: string, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cancelBooking", () => {
  test("accepts the lowercase confirmation TimeEdit returns", async () => {
    stubTimeEditResponse("TimeEdit - Ny avbokning");
    await expect(cancelBooking("cookie", "123")).resolves.toBeUndefined();
  });

  test("rejects a 200 response without a cancel confirmation", async () => {
    stubTimeEditResponse("<html>Logga in</html>");
    await expect(cancelBooking("cookie", "123")).rejects.toThrow(
      "TimeEdit cancel: unexpected response: <html>Logga in</html>"
    );
  });
});
