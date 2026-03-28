import { describe, expect, test } from "vitest";
import { loginRequestSchema } from "../schemas.js";

describe("loginRequestSchema username normalization", () => {
  test("appends @chalmers.se when username has no domain", () => {
    const parsed = loginRequestSchema.parse({
      username: "cid",
      password: "secret",
    });

    expect(parsed.username).toBe("cid@chalmers.se");
  });

  test("keeps full email unchanged", () => {
    const parsed = loginRequestSchema.parse({
      username: "cid@chalmers.se",
      password: "secret",
    });

    expect(parsed.username).toBe("cid@chalmers.se");
  });

  test("trims username before normalization", () => {
    const parsed = loginRequestSchema.parse({
      username: "  cid  ",
      password: "secret",
    });

    expect(parsed.username).toBe("cid@chalmers.se");
  });
});
