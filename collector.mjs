
import fs from 'node:fs';
import path from 'node:path';

const API1 =
  'https://wingoteacher.lovable.app/api/public/wingo?game=30S';

const API2 =
  'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?pageNo=1&pageSize=200';

const OUT_FILE = path.join(process.cwd(), 'data', 'history.json');
const INTERVAL_MS = 32000;
const LOOP_SECONDS = Number(process.env.LOOP_SECONDS || '0');
const MAX_RECORDS = 2000;

function extract(json) {
  if (Array.isArray(json)) return json;

  const candidates = [
    json?.data?.list,
    json?.data?.records,
    json?.data?.history,
    json?.data?.items,
    json?.data?.result,
    json?.list,
    json?.records,
    json?.history,
    json?.result,
    json?.data
  ];

  for (const rows of candidates) {
    if (Array.isArray(rows)) return rows;
  }

  return [];
}

function norm(record, index = 0) {
  if (typeof record === 'number') {
    record = { number: record, issue: `row-${index}` };
  }

  if (
    typeof record === 'string' &&
    /^\d$/.test(record.trim())
  ) {
    record = {
      number: record.trim(),
      issue: `row-${index}`
    };
  }

  if (!record || typeof record !== 'object') return null;

  let number = null;

  const values = [
    record.n,
    record.number,
    record.result,
    record.openCode,
    record.winNumber,
    record.winningNumber,
    record.num,
    record.value,
    record.code,
    record.premium
  ];

  for (const value of values) {
    if (value === null || value === undefined) continue;

    const match = String(value).trim().match(/^\d/);

    if (match) {
      number = Number(match[0]);
      break;
    }
  }

  if (!Number.isInteger(number) || number < 0 || number > 9) {
    return null;
  }

  const rawIssue =
    record.issueNumber ??
    record.issue ??
    record.period ??
    record.periodNumber ??
    record.drawIssue;

  // Real issue IDs are required; synthetic IDs could create duplicates.
  if (rawIssue === null || rawIssue === undefined) {
    return null;
  }

  const issue = String(rawIssue).trim();
  if (!issue) return null;

  return { issue, n: number };
}

async function fetchRows(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('ts', Date.now().toString());

    const response = await fetch(requestUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://www.92strike4.com',
        Referer: 'https://www.92strike4.com/',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Response valid JSON nahi hai');
    }

    return extract(json);
  } finally {
    clearTimeout(timeout);
  }
}

function loadOld() {
  try {
    const parsed = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(map) {
  const records = [...map.values()]
    .sort((a, b) =>
      String(b.issue).localeCompare(
        String(a.issue),
        undefined,
        { numeric: true }
      )
    )
    .slice(0, MAX_RECORDS);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  const temporaryFile = `${OUT_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(records, null, 2));
  fs.renameSync(temporaryFile, OUT_FILE);

  return records.length;
}

async function oneRound(map) {
  let added = 0;

  for (const url of [API1, API2]) {
    try {
      const rows = await fetchRows(url);

      console.log(
        new Date().toISOString(),
        'API:',
        url,
        'Rows received:',
        rows.length
      );

      let validRows = 0;

      for (let index = 0; index < rows.length; index++) {
        const record = norm(rows[index], index);
        if (!record) continue;

        validRows++;

        if (!map.has(record.issue)) {
          map.set(record.issue, record);
          added++;
        }
      }

      console.log('Valid records:', validRows);

      // Try the next API if this one returned no usable records.
      if (validRows > 0) break;
    } catch (error) {
      console.error('Fetch failed:', url, error.message);
    }
  }

  return added;
}

function mergeExisting(map) {
  for (const record of loadOld()) {
    const normalized = norm(record);

    if (normalized && !map.has(normalized.issue)) {
      map.set(normalized.issue, normalized);
    }
  }
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });

  console.log('Output file:', OUT_FILE);
  console.log('Loop seconds:', LOOP_SECONDS);

  const map = new Map();

  mergeExisting(map);
  console.log('Existing records:', map.size);

  if (LOOP_SECONDS <= 0) {
    const added = await oneRound(map);
    const total = saveAll(map);

    console.log(`Saved ${total} records; ${added} new.`);
    return;
  }

  const endTime = Date.now() + LOOP_SECONDS * 1000;
  let totalNew = 0;

  while (Date.now() < endTime) {
    mergeExisting(map);

    const added = await oneRound(map);
    totalNew += added;

    const total = saveAll(map);
    console.log(`Saved ${total} records; ${added} new.`);

    if (Date.now() + INTERVAL_MS >= endTime) break;

    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  }

  console.log(`Loop finished; ${totalNew} new records.`);
}

main().catch(error => {
  console.error('Collector error:', error?.stack || error);
  process.exitCode = 1;
});
