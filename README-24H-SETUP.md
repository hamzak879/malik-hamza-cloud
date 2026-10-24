# MALIK_HAMZA - 24 Hour Free Cloud Setup (GitHub)

Tumhara laptop OFF ho ya network na ho, tab bhi data GitHub ke server par jama hota rahega.
100% FREE, koi card nahi chahiye. Sirf Gmail se GitHub account chahiye.

## Step 1 - GitHub account
1. github.com par free account banao

## Step 2 - Naya repo banao
1. New repository -> naam: `malik-hamza-cloud` -> Public -> Create
2. Is folder ki 3 cheezein upload karo:
   - `collector.mjs`
   - `data/history.json` (pehli baar khali `[]` wali file bana kar upload karo)
   - `.github/workflows/collect.yml`
   - `MALIK_HAMZA.html` (tumhari wali file)

## Step 3 - Auto collect ON karo
1. Repo me Actions tab -> "I understand my workflows" -> Enable
2. `collect-history-24h` -> Run workflow -> Run (pehli baar manual test)
3. Bas! Ab har 5 min me GitHub khud API se data la kar `data/history.json` me save karega.
   Laptop OFF ho tab bhi chalta rahega.

## Step 4 - Web 24h online karo (GitHub Pages)
1. Repo Settings -> Pages -> Source: Deploy from branch -> main -> /root -> Save
2. Tumhe link milega: `https://tumhara-naam.github.io/malik-hamza-cloud/MALIK_HAMZA.html`
3. Ye link 24h online rahega, mobile/laptop kahin se bhi kholo.

## Step 5 - Frontend ko cloud se joro (optional lekin best)
MALIK_HAMZA.html me sync() ke start me ye 1 line add karo taake pehle cloud history load ho:

```js
try{
 const r = await fetch('./data/history.json',{cache:'no-store'});
 const j = await r.json();
 if(Array.isArray(j) && j.length){ merge(j); }
}catch(e){}
```

Matlab kholte hi cloud wala 2000 record ka backup load ho jayega,
phir live API se naye 200 jud jayenge.

## Kharcha?
- GitHub Actions free: mahine me ~2000 min free, ye wala sirf ~8000 sec (133 min) use karega
- GitHub Pages free, Supabase ki zaroorat nahi
- Limit: free Actions me kabhi 5 min ki jagah 7-8 min lag sakta hai, data phir bhi miss nahi hoga kyunki API 200 record deti hai

## Agar Render/Supabase chahiye?
Agar tumhe har 30 second ka real-time collector chahiye to Render + Supabase lagega.
Batao to uska `server.js + schema.sql` bhi bana dun.
