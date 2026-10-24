// MALIK_HAMZA 24h collector - GitHub Actions har 5 min me chalata hai
// Laptop OFF ho tab bhi GitHub ke server se data jama hota rahega
import fs from 'node:fs';

const API1 = "https://wingoteacher.lovable.app/api/public/wingo?game=30S";
const API2 = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?size=200";
const OUT = new URL("../data/history.json", import.meta.url);
const PRED_OUT = new URL("../data/latest-prediction.json", import.meta.url);
const MAX_CLOUD = 2000; // ~16-17 ghante (30sec x 2000) - roz ka 16 hour window
const INTERVAL_MS = 32000; // har 32 sec baad naya data
const LOOP_SECONDS = Number(process.env.LOOP_SECONDS || "0"); // 0 = sirf 1 baar, 270 = ~4.5 min loop

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
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "MALIK_HAMZA-collector" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return extract(await res.json());
  } finally { clearTimeout(t); }
}

async function oneRound(mapState) {
  let got = 0;
  for (const url of [API1, API2]) {
    try {
      const rows = await fetchRows(url);
      console.log(new Date().toISOString(), url, "->", rows.length, "rows");
      for (const raw of rows) {
        const r = norm(raw);
        if (!r) continue;
        if (!mapState.has(String(r.issue))) { mapState.set(String(r.issue), r); got++; }
        else { const p = mapState.get(String(r.issue)); mapState.set(String(r.issue), { ...r, ...p, n: r.n }); }
      }
      if (rows.length) break;
    } catch (e) { console.log("fail:", url, e.message); }
  }
  return got;
}

function loadOld() {
  try { const j = JSON.parse(fs.readFileSync(OUT, "utf8")); if (Array.isArray(j)) return j; return []; } catch { return []; }
}
function saveAll(mapState) {
  const all = [...mapState.values()].sort((a, b) => String(b.issue).localeCompare(String(a.issue), undefined, { numeric: true })).slice(0, MAX_CLOUD);
  fs.mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 1));
  // App ke liye prediction file banao (HTML ke mutabik)
  try {
    const pred = makePrediction(all);
    fs.writeFileSync(PRED_OUT, JSON.stringify(pred, null, 1));
  } catch(e){ console.log("pred fail:", e.message); }
  return all.length;
}
// HTML wali pair logic ka server version - taake app seedha ye file parhe
function makePrediction(allChronNewestFirst) {
  if (allChronNewestFirst.length < 2) return { status: "WAITING", time: new Date().toISOString() };
  const a = [...allChronNewestFirst].reverse(); // oldest->newest
  const pairMap = new Map();
  for (let i = 0; i < a.length - 2; i++) {
    const key = a[i].n + "," + a[i+1].n;
    if (!pairMap.has(key)) pairMap.set(key, []);
    pairMap.get(key).push(a[i+2].n);
  }
  const cur = [a[a.length-2].n, a[a.length-1].n];
  const arr = pairMap.get(cur.join(",")) || [];
  const big = arr.filter(n => n >= 5).length, small = arr.length - big;
  const cnt = Array(10).fill(0); arr.forEach(n => cnt[n]++);
  const rank = cnt.map((c,n)=>({n,c})).filter(x=>x.c).sort((x,y)=>y.c-x.c||x.n-y.n).slice(0,2);
  return {
    time: new Date().toISOString(),
    pair: cur.join("->"),
    samples: arr.length,
    predSize: big >= small ? "BIG" : "SMALL",
    predNums: rank.map(x=>x.n),
    big, small,
    status: arr.length ? "READY" : "NO_HISTORY"
  };
}

let old = loadOld();
const map = new Map(old.map(r => [String(r.issue), r]));

if (!LOOP_SECONDS) {
  const got = await oneRound(map);
  const total = saveAll(map);
  console.log(`saved ${total} records (+${got} new) -> data/history.json`);
} else {
  // Loop mode: GitHub Actions har 5 min me 1 job chalata hai, andar hum har 32 sec me fetch karenge
  const end = Date.now() + LOOP_SECONDS * 1000;
  let totalNew = 0;
  while (true) {
    const got = await oneRound(map);
    totalNew += got;
    const total = saveAll(map);
    console.log(`loop save: total=${total} +${got} new`);
    if (Date.now() + INTERVAL_MS > end) break;
    await new Promise(r => setTimeout(r, INTERVAL_MS));
    try { old = loadOld(); for (const r of old) if (!map.has(String(r.issue))) map.set(String(r.issue), r); } catch {}
  }
  console.log(`loop done: +${totalNew} new -> data/history.json`);
}
