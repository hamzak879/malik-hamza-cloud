
import fs from 'node:fs';
import path from 'node:path';

const API1 = "https://wingoteacher.lovable.app/api/public/wingo?game=30S";
const API2 = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=200";

const OUT_FILE = path.join(process.cwd(), "data", "history.json");
const INTERVAL_MS = 32000;
const LOOP_SECONDS = Number(process.env.LOOP_SECONDS || "0");

function extract(j) {
  if (Array.isArray(j)) return j;

  const candidates = [
    j?.data?.list,
    j?.data?.records,
    j?.data?.history,
    j?.data?.items,
    j?.data?.result,
    j?.list,
    j?.records,
    j?.history,
    j?.result,
    j?.data
  ];

  for (const rows of candidates) {
    if (Array.isArray(rows)) return rows;
  }

  return [];
}

function norm(r, i = 0) {
  if (typeof r === "number") {
    r = { number: r, issue: "row-" + i };
  }

  if (typeof r === "string" && /^\d$/.test(r)) {
    r = { number: Number(r), issue: "row-" + i };
  }

  if (!r || typeof r !== "object") return null;

  let n = null;

  for (const v of [
    r.n,
    r.number,
    r.result,
    r.openCode,
    r.winNumber,
    r.winningNumber,
    r.num,
    r.value,
    r.code
  ]) {
    if (v === null || v === undefined) continue;

    const match = String(v).trim().match(/^\d/);

    if (match) {
      n = Number(match[0]);
      break;
    }
  }

  if (!Number.isInteger(n) || n < 0 || n > 9) return null;

  const issue = String(
    r.issueNumber ??
    r.issue ??
    r.period ??
    r.periodNumber ??
    r.drawIssue ??
    ("row-" + i)
  );

  return { issue, n };
}

async function fetchRows(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set("ts", Date.now().toString());

    const res = await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.92strike4.com",
        "Referer": "https://www.92strike4.com/"
      }
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const text = await res.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Response JSON nahi hai");
    }

    return extract(json);
  } finally {
    clearTimeout(timeout);
  }
}

async function oneRound(mapState) {
  let added = 0;

  for (const url of [API1, API2]) {
    try {
      const rows = await fetchRows(url);

      console.log(
        new Date().toISOString(),
        url,
        "->",
        rows.length,
        "rows"
      );

      for (let i = 0; i < rows.length; i++) {
        const record = norm(rows[i], i);

        if (!record) continue;

        if (!mapState.has(record.issue)) {
          mapState.set(record.issue, record);
          added++;
        }
      }

      if (rows.length > 0) break;
    } catch (error) {
      console.log("Fetch failed:", url, error.message);
    }
  }

  return added;
}

function loadOld() {
  try {
    const json = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

function saveAll(mapState) {
  const all = [...mapState.values()]
    .sort((a, b) =>
      String(b.issue).localeCompare(
        String(a.issue),
        undefined,
        { numeric: true }
      )
    )
    .slice(0, 2000);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2));

  return all.length;
}

try {
  console.log("Output file:", OUT_FILE);
  console.log("Loop seconds:", LOOP_SECONDS);

  const old = loadOld();
  console.log("Existing records:", old.length);

  const map = new Map(
    old
      .filter(r => r && r.issue !== undefined && r.n !== undefined)
      .map(r => [String(r.issue), r])
  );

  if (!LOOP_SECONDS) {
    const added = await oneRound(map);
    const total = saveAll(map);

    console.log(`Saved ${total} records; ${added} new.`);
  } else {
    const endTime = Date.now() + LOOP_SECONDS * 1000;
    let totalNew = 0;

    while (Date.now() < endTime) {
      const added = await oneRound(map);
      totalNew += added;

      const total = saveAll(map);

      console.log(`Saved ${total} records; ${added} new.`);

      if (Date.now() + INTERVAL_MS >= endTime) break;

      await new Promise(resolve =>
        setTimeout(resolve, INTERVAL_MS)
      );

      for (const record of loadOld()) {
        if (
          record &&
          record.issue !== undefined &&
          !map.has(String(record.issue))
        ) {
          map.set(String(record.issue), record);
        }
      }
    }

    console.log(`Loop finished; ${totalNew} new records.`);
  }
} catch (error) {
  console.error("Collector error:", error?.message || error);

  try {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

    if (!fs.existsSync(OUT_FILE)) {
      fs.writeFileSync(OUT_FILE, "[]");
    }
  } catch (writeError) {
    console.error("File error:", writeError.message);
  }
}

process.exit(0);
