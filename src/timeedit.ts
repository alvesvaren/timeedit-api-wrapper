/** Chalmers TimeEdit cloud base paths */
const ORIGIN = "https://cloud.timeedit.net";
const WEB_BASE = `${ORIGIN}/chalmers/web`;
const STUDENT = `${WEB_BASE}/student`;

const RESERVE_PAGE = `${STUDENT}/ri1Q8.html`;
const COOKIE_NAME = "TEchalmersweb";

function extractSessionCookie(setCookieHeaders: string[]): string | null {
  for (const line of setCookieHeaders) {
    const m = line.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return `${COOKIE_NAME}=${m[1]}`;
  }
  return null;
}

function getSetCookieValues(res: Response): string[] {
  const anyHeaders = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

export async function exchangeJwtForSessionCookie(jwt: string): Promise<string> {
  const res = await fetch(WEB_BASE, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN,
      "User-Agent": timeEditUserAgent(),
    },
    body: new URLSearchParams({ teauthtoken: jwt }),
  });

  const cookies = getSetCookieValues(res);
  const session = extractSessionCookie(cookies);
  if (!session) {
    throw new Error("TimeEdit login failed: no TEchalmersweb cookie in response");
  }
  return session;
}

type ObjectsJson = {
  objects?: Array<{
    id: string;
    idAndType?: string;
    fields?: Record<string, string>;
  }>;
};

export async function fetchGroupRooms(sessionCookie: string) {
  const params = new URLSearchParams({
    max: "50",
    fr: "f",
    part: "t",
    partajax: "t",
    im: "f",
    step: "1",
    sid: "4",
    l: "sv_SE",
    ohg: "0",
    types: "4",
    subtypes: "4",
  });
  params.append("fe", "14.Grupprum");
  params.append("fe", "48.Bokning lokaler normal (stud)");

  const url = `${STUDENT}/objects.json?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      Cookie: sessionCookie,
      "X-Requested-With": "XMLHttpRequest",
      Referer: RESERVE_PAGE,
      "User-Agent": timeEditUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`TimeEdit objects.json failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as ObjectsJson;
  return data.objects ?? [];
}

/**
 * Weekly room grid from `ri.html` with a single `objects` id (see HAR `data-linkToPage`;
 * using one room ensures all `bookingDiv` titles refer to that room only).
 */
export async function fetchRoomWeekGridHtml(
  sessionCookie: string,
  roomId: string,
  weekOffset = 0
): Promise<string> {
  const params = new URLSearchParams({
    h: "t",
    sid: "4",
    objects: `${roomId}.4`,
    ox: "0",
    types: "0",
    fe: "0",
    part: "t",
    partajax: "t",
    tg: "-1",
    se: "f",
    exw: "t",
    rr: "1",
  });
  if (weekOffset !== 0) {
    params.set("p", `${weekOffset}.w,${weekOffset}.w`);
  }
  const url = `${STUDENT}/ri.html?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "*/*",
      Cookie: sessionCookie,
      "X-Requested-With": "XMLHttpRequest",
      Referer: RESERVE_PAGE,
      "User-Agent": timeEditUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`TimeEdit ri.html (schedule) failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
  return res.text();
}

export async function fetchCsrfToken(sessionCookie: string): Promise<string> {
  const res = await fetch(RESERVE_PAGE, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: sessionCookie,
      Origin: ORIGIN,
      Referer: RESERVE_PAGE,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
      "User-Agent": timeEditUserAgent(),
    },
    body: new URLSearchParams({ CSTTG: "gen" }),
  });

  if (!res.ok) {
    throw new Error(`TimeEdit CSRF token request failed: ${res.status}`);
  }

  const token = (await res.text()).trim();
  // TimeEdit returns a decimal integer string (sometimes negative)
  if (!/^-?\d+$/.test(token)) {
    throw new Error(`TimeEdit returned invalid CSRF token: ${token.slice(0, 80)}`);
  }
  return token;
}

export type BookRoomParams = {
  roomId: string;
  /** yyyymmdd */
  datesCompact: string;
  startTime: string;
  endTime: string;
  title?: string;
  comment?: string;
};

export async function submitBooking(
  sessionCookie: string,
  csrfToken: string,
  p: BookRoomParams
): Promise<string> {
  const body = new URLSearchParams({
    kind: "reserve",
    nocache: String(Math.floor(Math.random() * 20) + 1),
    l: "sv_SE",
    o: `${p.roomId}.4`,
    aos: "",
    dates: p.datesCompact,
    starttime: p.startTime,
    endtime: p.endTime,
    url: RESERVE_PAGE,
    fe1: p.title ?? "",
    fe3: p.comment ?? "",
    CSTT: csrfToken,
  });

  const res = await fetch(RESERVE_PAGE, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: sessionCookie,
      Origin: ORIGIN,
      Referer: RESERVE_PAGE,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "*/*",
      "User-Agent": timeEditUserAgent(),
    },
    body,
  });

  if (res.status !== 303 && res.status !== 302) {
    const errText = await res.text();
    throw new Error(
      `TimeEdit booking failed: expected redirect, got ${res.status}: ${errText.slice(0, 500)}`
    );
  }

  const location = res.headers.get("location");
  if (!location) {
    throw new Error("TimeEdit booking: no Location header on redirect");
  }

  const locUrl = new URL(location, ORIGIN);
  const id = locUrl.searchParams.get("id");
  if (!id) {
    throw new Error(`TimeEdit booking: could not parse reservation id from ${location}`);
  }

  return id;
}

export async function fetchMyBookingsHtml(sessionCookie: string): Promise<string> {
  const params = new URLSearchParams({
    so: "5",
    p: "0.d,20.d",
    max: "50",
    part: "t",
    step: "3",
    g: "f",
    ph: "f",
    sid: "4",
  });
  const url = `${STUDENT}/my.html?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/html, */*; q=0.01",
      Cookie: sessionCookie,
      Referer: RESERVE_PAGE,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": timeEditUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`TimeEdit my.html failed: ${res.status}`);
  }
  return res.text();
}

export async function cancelBooking(
  sessionCookie: string,
  reservationId: string
): Promise<void> {
  const params = new URLSearchParams({
    id: reservationId,
    l: "sv_SE",
    sid: "8",
  });
  const url = `${STUDENT}/my.html?${params.toString()}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "text/plain, */*; q=0.01",
      Cookie: sessionCookie,
      Origin: ORIGIN,
      Referer: `${STUDENT}/my.html?h=t&sid=8&id=${encodeURIComponent(reservationId)}&fr=t&step=3&myp=t&objects=0&ef=2&nocache=2`,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": timeEditUserAgent(),
    },
  });

  if (!res.ok) {
    throw new Error(`TimeEdit cancel failed: ${res.status} ${await res.text()}`);
  }

  const text = (await res.text()).trim();
  if (!text.includes("Avbokning")) {
    throw new Error(`TimeEdit cancel: unexpected response: ${text.slice(0, 200)}`);
  }
}

function timeEditUserAgent(): string {
  return "Mozilla/5.0 (compatible; timeedit-api-wrapper/1.0)";
}

/** Convert YYYY-MM-DD to YYYYMMDD */
export function dateToCompact(date: string): string {
  return date.replaceAll("-", "");
}
