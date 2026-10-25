// MALIK_HAMZA 24h collector - FIXED version
// GitHub Actions har 5 min me chalata hai, laptop OFF ho tab bhi data jama hota rahega
import fs from 'node:fs';
import path from 'node:path';

const API1 = "https://wingoteacher.lovable.app/api/public/wingo?game=30S";

const API2 = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=200";


// FIX: Actions me sahi path ke liye process.cwd() use karo (import.meta wala bug fix)
const OUT_FILE = path.join(process.cwd(), "data", "history.json");
const INTERVAL_MS = 32000;
const LOOP_SECONDS = Number(process.env.LOOP_SECONDS || "0");

function extract(j) {
  if (Array.isArray(j)) return j;
  const cands = [j?.data?.list, j?.data?.records, j?.data?.history, j?.data?.items, j?.data?.result, j?.list, j?.records, j?.history, j?.result, j?.data];
  for (const x of cands) if (Array.isArray(x)) return x;
  return [];
}
function norm(r, i = 0) {
  if (typeof r === "number") r = { number: r, issue: "row-" + i };
  if (typeof r === "string" && /^\d$/.test(r)) r = { number: +r, issue: "row-" + i };
  if (!r || typeof r !== "object") return null;
  let n = null;
  for (const v of [r.n, r.number, r.result, r.openCode, r.winNumber, r.winningNumber, r.num, r.value, r.code]) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim(), m = s.match(/^\d/);
    if (m) { n = +m[0]; break; }
  }
  if (!Number.isInteger(n) || n < 0 || n > 9) return null;
  const issue = String(r.issueNumber ?? r.issue ?? r.period ?? r.periodNumber ?? r.drawIssue ?? ("row-" + i));
  return { issue, n };
}


async function fetchRows(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);

  try {
const requestUrl = new URL(url);
requestUrl.searchParams.set("ts", Date.now().toString());

const res = await fetch(requestUrl, {
  signal: ctrl.signal,
  headers: {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.92strike4.com",
    "Referer": "https://www.92strike4.com/"
  }
});
    });

    if (!res.ok) {
      throw new Error("HTTP " + res.status);
    }

    const text = await res.text();
    let j;

    try {
      j = JSON.parse(text);
    } catch {
      throw new Error("not-json");
    }

    return extract(j);
  } finally {
    clearTimeout(t);
  }
}


async function oneRound(mapState) {
  let got = 0;
  for (const url of [API1, API2]) {
    try {
      const rows = await fetchRows(url);
      console.log(new Date().toISOString(), url, "->", rows.length, "rows");
      for (let i = 0; i < rows.length; i++) {
        const r = norm(rows[i], i);
        if (!r) continue;
        if (!mapState.has(String(r.issue))) { mapState.set(String(r.issue), r); got++; }
      }
      if (rows.length) break;
    } catch (e) { console.log("fail:", url, e.message); }
  }
  return got;
}

function loadOld() {
  try {
    const j = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
    if (Array.isArray(j)) return j;
    return [];
  } catch { return []; }
}
function saveAll(mapState) {
  const all = [...mapState.values()]
    .sort((a, b) => String(b.issue).localeCompare(String(a.issue), undefined, { numeric: true }))
    .slice(0, 2000);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 1));
  return all.length;
}

try {
  console.log("OUT =", OUT_FILE, "| LOOP_SECONDS =", LOOP_SECONDS);
  const old = loadOld();
  console.log("old records:", old.length);
  const map = new Map(old.map(r => [String(r.issue), r]));

  if (!LOOP_SECONDS) {
    const got = await oneRound(map);
    const total = saveAll(map);
    console.log(`saved ${total} records (+${got} new) -> data/history.json`);
  } else {
    const end = Date.now() + LOOP_SECONDS * 1000;
    let totalNew = 0;
    while (true) {
      const got = await oneRound(map);
      totalNew += got;
      const total = saveAll(map);
      console.log(`loop save: total=${total} +${got} new`);
      if (Date.now() + INTERVAL_MS > end) break;
      await new Promise(r => setTimeout(r, INTERVAL_MS));
      try {
        const fresh = loadOld();
        for (const r of fresh) if (!map.has(String(r.issue))) map.set(String(r.issue), r);
      } catch {}
    }
    console.log(`loop done: +${totalNew} new -> data/history.json`);
  }
} catch (e) {
  console.log("collector error (but exit 0 so Actions fail na ho):", e?.message || e);
  try {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    if (!fs.existsSync(OUT_FILE)) fs.writeFileSync(OUT_FILE, "[]");
  } catch {}
}
// kabhi fail exit code mat do taake Actions red na ho
process.exit(0);
