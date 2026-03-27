import type { Context } from "hono";
import { parse } from "node-html-parser";
import type { LoginInput } from "../schemas.js";
import { exchangeJwtForSessionCookie } from "../timeedit.js";

const USER_AGENT = "Mozilla/5.0 (compatible; timeedit-api-wrapper/1.0)";
const CHALMERS_SSO_START_URL =
  "https://idp.chalmers.se/adfs/ls/?SAMLRequest=nZJPbxoxEMW%2FiuU768Vk%2F1ksiAaqIqUtCiSHXiLjHYpVr009szT59lWWrppcOOQ68zy%2F92Y8nT%2B3jp0hog2%2B5uMk5fPZFHXrTmrR0dHfw%2B8OkNhz6zyqvlHzLnoVNFpUXreAiozaLr7eKZmk6hQDBRMcZ%2BtlzZ%2FAFIe8yqu8rPLSAMAk3Tc3sjRlMS4gS6tGF9nNATh7HEzIJOVsjdjB2iNpTzWXqcxH6WQki52UaiJVViVZmf3gbPMP98n6xvqf173tLyJUX3a7zWjzfbvjbAlI1mvq0UeiEyohbHNKzFG7FiImCEI3BxQOBWcLRIiv4tvgsWshbiGerYGH%2B7v%2Fz3VHx4RsC9BYSjyQOI%2F7IniyRhMIo53ba%2FNLrB6eVqvtnF%2BWrvrY8c22rwfSgxs%2BG9jGha55Dx%2BSTMUbxnDlb7qF9XITnDUvH7nywrnw5zaCJqg5xQ44%2Bxxiq%2Bn6gNeKbUaHXqooao8WPHExu7h8%2FfxeQtZ2yCf4Iejofx9HQe3tRxiPkgGQNvhGLmLHIuu4fEQ0TyzlAW4jN%2Fe3fhqk7InltnQE2at%2BIAqAWdWzs2zanLEnaDmzPJGrgG438exEjDDbAVbldMGJXv%2FifYx0jD24Qzqr5DGQTVxqZa40ro%3D";

type CookieJar = Map<string, string>;

/** Body is validated by OpenAPI middleware (`loginRequestSchema`). */
export async function loginHandler(c: Context, body: LoginInput) {
  try {
    const token = await loginWithChalmersSso(body.username, body.password);
    await exchangeJwtForSessionCookie(token);
    return c.json({ token }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json({ error: "Login failed" as const, detail: message }, 401);
  }
}

async function loginWithChalmersSso(username: string, password: string): Promise<string> {
  const jar: CookieJar = new Map();

  const loginPage = await fetchWithCookies(CHALMERS_SSO_START_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "manual",
  }, jar);

  const loginForm = parseForm(await loginPage.text(), "#loginForm", loginPage.url);
  loginForm.fields.UserName = username;
  loginForm.fields.Password = password;
  loginForm.fields.AuthMethod ||= "FormsAuthentication";

  const loginSubmit = await fetchWithCookies(loginForm.action, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://idp.chalmers.se",
      Referer: loginPage.url,
    },
    body: new URLSearchParams(loginForm.fields),
    redirect: "manual",
  }, jar);

  let loginResult = loginSubmit;
  if (loginSubmit.status >= 300 && loginSubmit.status < 400) {
    const next = loginSubmit.headers.get("location");
    if (!next) throw new Error("ADFS login redirect missing Location header");
    loginResult = await fetchWithCookies(new URL(next, loginForm.action).toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: loginForm.action,
      },
      redirect: "manual",
    }, jar);
  }

  const callbackForm = parseForm(await loginResult.text(), "form", loginResult.url);
  if (!("SAMLResponse" in callbackForm.fields)) {
    throw new Error("SSO login did not return a SAML response");
  }

  const callbackResponse = await fetchWithCookies(callbackForm.action, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: loginResult.url,
    },
    body: new URLSearchParams(callbackForm.fields),
    redirect: "manual",
  }, jar);

  const successLocation = callbackResponse.headers.get("location");
  if (!successLocation) {
    throw new Error("TimeEdit callback did not redirect to a success URL");
  }

  const successUrl = new URL(successLocation, callbackForm.action);
  const token = successUrl.searchParams.get("token");
  if (!token) {
    throw new Error("TimeEdit success redirect did not contain a token");
  }
  return token;
}

function parseForm(
  html: string,
  selector: string,
  baseUrl: string,
): { action: string; fields: Record<string, string> } {
  const root = parse(html);
  const form = root.querySelector(selector);
  if (!form) {
    throw new Error(`Expected form ${selector} in upstream response`);
  }

  const action = form.getAttribute("action");
  if (!action) {
    throw new Error("Upstream form missing action attribute");
  }

  const fields: Record<string, string> = {};
  for (const input of form.querySelectorAll("input")) {
    const name = input.getAttribute("name");
    if (!name) continue;
    fields[name] = input.getAttribute("value") ?? "";
  }
  return { action: new URL(action, baseUrl).toString(), fields };
}

async function fetchWithCookies(
  url: string,
  init: RequestInit,
  jar: CookieJar,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookieHeader = serializeCookies(jar);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  const res = await fetch(url, { ...init, headers });
  mergeSetCookies(jar, getSetCookieValues(res));
  return res;
}

function getSetCookieValues(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function mergeSetCookies(jar: CookieJar, setCookies: string[]): void {
  for (const line of setCookies) {
    const pair = line.split(";", 1)[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function serializeCookies(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}
