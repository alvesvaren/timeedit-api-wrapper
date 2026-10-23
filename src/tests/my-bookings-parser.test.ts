import { describe, expect, test } from "vitest";
import {
  parseLinksDataSidFromMyBookingsBootstrap,
  parseMyBookingsHtml,
  parseTimeEditObjectsId,
} from "../parsers.js";

describe("parseLinksDataSidFromMyBookingsBootstrap", () => {
  test("reads data-sid from linksdata tag", () => {
    const html = `<div id="linksdata" data-sid="8" data-lang="sv_SE" class="hidden"></div>`;
    expect(parseLinksDataSidFromMyBookingsBootstrap(html)).toBe("8");
  });
  test("returns undefined when missing", () => {
    expect(parseLinksDataSidFromMyBookingsBootstrap("<div></div>")).toBeUndefined();
  });
});

describe("parseTimeEditObjectsId", () => {
  test("parses typed object id", () => {
    expect(parseTimeEditObjectsId("485.4")).toBe("485");
  });
  test("takes first segment", () => {
    expect(parseTimeEditObjectsId("485.4,486.4")).toBe("485");
  });
  test("plain numeric", () => {
    expect(parseTimeEditObjectsId("485")).toBe("485");
  });
});

describe("parseMyBookingsHtml roomId from row", () => {
  const rowCore = `
      <td class="time">2026-03-28&nbsp; 11:15 - 12:15</td>
      <td><a href="ri.html?sid=4&amp;objects=485.4&amp;h=t">Öppna</a></td>
      <td>KG34</td>
      <td></td>
      <td>2026-03-27 10:00</td>
  `;

  test("extracts roomId from objects= in link href", () => {
    const html = `<table><tbody>
      <tr class="rr" data-id="182700">${rowCore}</tr>
    </tbody></table>`;
    const rows = parseMyBookingsHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.roomId).toBe("485");
    expect(rows[0]!.roomName).toBe("KG34");
  });

  test("matches live TimeEdit row (data-id before class, rr clickable2)", () => {
    const html = `<table class="restable"><tbody>
      <tr data-id="182700" class="rr clickable2" tabindex="0">
        <td class="modifiedRecentlyTd"></td>
        <td class="time tt c-1">2026-03-28 &nbsp; 18:00 - 19:00</td>
        <td>KG34</td>
        <td>1:00</td>
        <td>2026-03-27 13:36</td>
      </tr>
    </tbody></table>`;
    const rows = parseMyBookingsHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("182700");
    expect(rows[0]!.roomName).toBe("KG34");
    expect(rows[0]!.createdAtRaw).toBe("2026-03-27 13:36");
  });

  test("reads room and created columns by header when a title column precedes the room", () => {
    const html = `<table cellspacing="0" class="restable">
      <tr class="columnHeaders">
        <th class="modifiedRecentlyTd"></th>
        <th class="timepadd"><div class="chwrap" title="Tid">Tid</div></th>
        <th><div class="chwrap" title="Rubrik">Rubrik</div></th>
        <th><div class="chwrap" title="Lokalnamn">Lokalnamn</div></th>
        <th class="columnLineRight"><div class="chwrap" title="Längd timmar">Längd timmar</div></th>
        <th><div class="chwrap" title="Skapad">Skapad</div></th>
        <th><div class="chwrap" title="Status">Status</div></th>
      </tr>
      <tr data-id="311794" class="rr clickable2" tabindex="0" onclick="openRes(311794, this, 'time311794','&step=3&amp;myp=t')">
        <td class="modifiedRecentlyTd"></td>
        <td id="time311794" class="time tt c-1" title="ID 311794">2026-10-27 &nbsp; 13:00 - 17:00</td>
        <td class="column0 columnLine nw c-1">
          Grupprum</td>
        <td class="column1 columnLine nw c-1">
          EG-3211B</td>
        <td class="column0 columnLine nw c-1 columnLineRight">
          4:00</td>
        <td class="column1 columnLine nw c-1">
          2026-10-23 11:59</td>
        <td class="column0 columnLine nw c-1">
          Bekräftad</td>
      </tr>
    </table>`;
    expect(parseMyBookingsHtml(html)).toEqual([
      {
        id: "311794",
        start: "2026-10-27T13:00:00",
        end: "2026-10-27T17:00:00",
        roomName: "EG-3211B",
        createdAtRaw: "2026-10-23 11:59",
      },
    ]);
  });

  test("extracts roomId from absolute my.html href", () => {
    const html = `<table><tbody>
      <tr class="rr" data-id="1">
      <td class="time">2026-03-28&nbsp; 11:15 - 12:15</td>
      <td>
        <a href="https://cloud.timeedit.net/chalmers/web/student/my.html?sid=8&amp;id=1&amp;objects=999.4&amp;step=3">x</a>
      </td>
      <td>Room A</td>
      <td></td>
      <td>2026-03-27 10:00</td>
      </tr>
    </tbody></table>`;
    const rows = parseMyBookingsHtml(html);
    expect(rows[0]!.roomId).toBe("999");
  });

  test("omits roomId when no objects in row", () => {
    const html = `<table><tbody>
      <tr class="rr" data-id="182700">
      <td class="time">2026-03-28&nbsp; 11:15 - 12:15</td>
      <td></td>
      <td>KG34</td>
      <td></td>
      <td>2026-03-27 10:00</td>
      </tr>
    </tbody></table>`;
    const rows = parseMyBookingsHtml(html);
    expect(rows[0]!.roomId).toBeUndefined();
  });

  test("data-objects on tr", () => {
    const html = `<table><tbody>
      <tr class="rr" data-id="1" data-objects="42.4">
      <td class="time">2026-03-28&nbsp; 11:15 - 12:15</td>
      <td></td>
      <td>X</td>
      <td></td>
      <td>2026-03-27 10:00</td>
      </tr>
    </tbody></table>`;
    expect(parseMyBookingsHtml(html)[0]!.roomId).toBe("42");
  });
});
