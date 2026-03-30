import { app } from "../app.js";

/**
 * In CI, map repo secrets TEST_CID + TEST_PASSWORD to TIMEEDIT_TOKEN via real login.
 * Skipped when TIMEEDIT_TOKEN is already set or CI is unset (local `pnpm test`).
 */
const cid = process.env.TEST_CID?.trim();
const password = process.env.TEST_PASSWORD;
const isCi = process.env.CI === "true";

if (isCi && cid && password && !process.env.TIMEEDIT_TOKEN) {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: cid, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`E2E setup login failed: HTTP ${res.status} ${body}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error("E2E setup login: missing token in response");
  }
  process.env.TIMEEDIT_TOKEN = data.token;
}
