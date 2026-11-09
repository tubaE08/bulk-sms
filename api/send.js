const COOLDOWN = 60; // seconds
const ipHits = new Map();
const numHits = new Map();

function wait(map, key) {
  const left = COOLDOWN - Math.floor((Date.now() - (map.get(key) || 0)) / 1000);
  return left > 0 ? left : 0;
}

function explain(j) {
  let msg = j.message || 'API error';
  if (j.causes && typeof j.causes === 'object') {
    const parts = [];
    for (const [field, list] of Object.entries(j.causes)) {
      for (const c of [].concat(list)) {
        const a = c.attribute || {};
        if (c.type === 'between') parts.push(`${field}: ${a.min} থেকে ${a.max} অক্ষর হতে হবে`);
        else parts.push(`${field}: ${c.type || 'invalid'}`);
      }
    }
    if (parts.length) msg += ' - ' + parts.join(', ');
  }
  return msg;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { name, number, business_name } = req.body || {};
  if (!name || !number || !business_name) return res.status(400).json({ ok: false, error: 'সব ঘর পূরণ করুন' });
  if (!/^01\d{9}$/.test(number)) return res.status(400).json({ ok: false, error: 'নম্বর ঠিক নয় (01XXXXXXXXX)' });
  if (name.length > 40) return res.status(400).json({ ok: false, error: 'Name too long' });
  if (business_name.trim().length < 3 || business_name.length > 50) return res.status(400).json({ ok: false, error: 'Business name 3 theke 50 akkhor hote hobe' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const w = Math.max(wait(ipHits, ip), wait(numHits, number));
  if (w > 0) return res.status(429).json({ ok: false, wait: w, error: `আবার পাঠাতে ${w} সেকেন্ড অপেক্ষা করুন` });

  if (ipHits.size > 5000) ipHits.clear();
  if (numHits.size > 5000) numHits.clear();
  ipHits.set(ip, Date.now());
  numHits.set(number, Date.now());

  const url = 'http://textsmsc.liveblog365.com/t.php?name=' + encodeURIComponent(name.trim()) +
    '&number=' + encodeURIComponent(number) +
    '&business_name=' + encodeURIComponent(business_name.trim());

  const fail = (status, error, raw) => {
    ipHits.delete(ip); numHits.delete(number); // failed: allow retry
    return res.status(status).json({ ok: false, error, raw });
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'Accept': 'application/json,text/plain,*/*' }
    });
    clearTimeout(timer);
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch (_) {}

    if (j && j.error) return fail(200, explain(j), j);
    if (!r.ok) return fail(502, 'API HTTP ' + r.status + ': ' + text.slice(0, 150), text.slice(0, 300));
    if (!j && /error|invalid|fail/i.test(text)) return fail(200, text.slice(0, 200), text.slice(0, 300));

    return res.status(200).json({ ok: true, message: (j && j.message) || text.slice(0, 200) || 'Sent', raw: j || text.slice(0, 300) });
  } catch (e) {
    return fail(500, e.name === 'AbortError' ? 'API timeout (15s)' : 'API connect hoy ni: ' + (e.cause?.code || e.message));
  }
}


