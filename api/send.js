const COOLDOWN = 60; // seconds
const ipHits = new Map();
const numHits = new Map();

function wait(map, key) {
  const left = COOLDOWN - Math.floor((Date.now() - (map.get(key) || 0)) / 1000);
  return left > 0 ? left : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { name, number, business_name } = req.body || {};
  if (!name || !number || !business_name) return res.status(400).json({ ok: false, error: 'সব ঘর পূরণ করুন' });
  if (!/^01\d{9}$/.test(number)) return res.status(400).json({ ok: false, error: 'নম্বর ঠিক নয় (01XXXXXXXXX)' });
  if (name.length > 40 || business_name.length > 40) return res.status(400).json({ ok: false, error: 'Name too long' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const w = Math.max(wait(ipHits, ip), wait(numHits, number));
  if (w > 0) return res.status(429).json({ ok: false, wait: w, error: `আবার পাঠাতে ${w} সেকেন্ড অপেক্ষা করুন` });

  if (ipHits.size > 5000) ipHits.clear();
  if (numHits.size > 5000) numHits.clear();
  ipHits.set(ip, Date.now());
  numHits.set(number, Date.now());

  const url = 'http://textsmsc.liveblog365.com/t.php?name=' + encodeURIComponent(name) +
    '&number=' + encodeURIComponent(number) +
    '&business_name=' + encodeURIComponent(business_name);
  try {
    const r = await fetch(url);
    const text = await r.text();
    res.status(200).json({ ok: r.ok, response: text.slice(0, 300) });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'API request failed' });
  }
}
