// fetch-data.js — runs in GitHub Actions (Node 20+, built-in fetch).
// Pulls keyless prices server-side and writes data.json. No API keys.

const fs = require('fs');

// App ticker -> Yahoo symbol. Default = same ticker. Overrides for LSE/Xetra/class shares.
const SYMBOLS = {
  "RMV":"RMV.L","AO.":"AO.L","BA.":"BA.L","LGEN":"LGEN.L",
  "VUAG":"VUAG.L","VWCE":"VWCE.DE","IMID":"IMID.L","BRK.B":"BRK-B"
};
// Tickers to attempt (mirrors the app's holdings).
const TICKERS = ["TIL","FRSH","BORR","UNH","BRK.B","MBX","TEM","IREN","VUAG","PLTR","RMV","TTWO","RZLV","ORCL","SPCX","QUBT","EVTL","TMC","NOW","BTBT","AO.","NFLX","CEG","BA.","VRRM","SPIR","KTOS","CLSK","CRM","PBF","TSLA","FVRR","CGNT","SATL","PS","LEA","IMID","RGTI","ACHR","INFQ","VWCE","TLS","AMTM","NVDA","LAKE","GEMI","LGEN","APT","CIFR","ABTC","IRT","TDG","TSAT","SIDU","ALTO","KDK"];

const CRYPTO = {bitcoin:"BTC",ethereum:"ETH",ripple:"XRP",solana:"SOL",chainlink:"LINK","quant-network":"QNT","render-token":"RENDER",jasmycoin:"JASMY","shiba-inu":"SHIB"};
const UA = {"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)"};
const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function yfetch(appTicker){
  const sym = SYMBOLS[appTicker] || appTicker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1wk&range=1y`;
  try{
    const r = await fetch(url,{headers:UA});
    if(!r.ok) throw new Error(r.status);
    const j = await r.json();
    const res = j.chart.result[0]; const m = res.meta;
    const price = m.regularMarketPrice, prev = m.chartPreviousClose ?? m.previousClose;
    if(price==null) throw new Error('no price');
    const chgPct = prev ? ((price-prev)/prev*100) : 0;
    let hist = [];
    try{ hist = (res.indicators.quote[0].close||[]).filter(x=>x!=null).map(x=>+x.toFixed(2)); }catch(_){}
    if(hist.length>53) hist = hist.slice(-53);
    return {price:+price.toFixed(2), prevClose:prev?+prev.toFixed(2):null, chgPct:+chgPct.toFixed(2), cur:m.currency||'USD', sym, hist};
  }catch(e){ console.log('skip',appTicker,'('+sym+'):',e.message); return null; }
}

async function main(){
  const out = {asOf:new Date().toISOString(), fx:{}, equities:{}, crypto:{}};

  // FX (keyless, CORS-open)
  try{
    const r = await fetch('https://open.er-api.com/v6/latest/USD'); const j = await r.json();
    out.fx = {USDGBP:+j.rates.GBP.toFixed(4), USDEUR:+j.rates.EUR.toFixed(4), GBPUSD:+(1/j.rates.GBP).toFixed(4)};
  }catch(e){ console.log('fx fail:',e.message); }

  // Crypto (keyless)
  try{
    const ids = Object.keys(CRYPTO).join(',');
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    const j = await r.json();
    for(const id in CRYPTO){ if(j[id]) out.crypto[CRYPTO[id]] = {usd:j[id].usd, chg:+(j[id].usd_24h_change||0).toFixed(2)}; }
  }catch(e){ console.log('crypto fail:',e.message); }

  // Equities (keyless Yahoo v8, one at a time, polite delay)
  let hits=0;
  for(const t of TICKERS){
    const q = await yfetch(t);
    if(q){ out.equities[t]=q; hits++; }
    await sleep(350);
  }

  fs.writeFileSync('data.json', JSON.stringify(out,null,1));
  console.log(`done: ${hits}/${TICKERS.length} equities, ${Object.keys(out.crypto).length} crypto, fx ${out.fx.USDGBP||'-'}`);
}
main();
