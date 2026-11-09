const COOLDOWN = 60; // seconds
const ipHits = new Map();
const numHits = new Map();

function wait(map, key) {
  const left = COOLDOWN - Math.floor((Date.now() - (map.get(key) || 0)) / 1000);
  return left > 0 ? left : 0;
}

import { logToGithub } from './visit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });
  const { name, number, business_name } = req.body || {};
  if (!name || !number || !business_name) return res.status(400).json({ ok: false, error: 'সব ঘর পূরণ করুন' });
  if (!/^01\d{9}$/.test(number)) return res.status(400).json({ ok: false, error: 'নম্বর ঠিক নয় (01XXXXXXXXX)' });
  if (name.trim().length > 40) return res.status(400).json({ ok: false, error: 'Name too long' });
  if (business_name.trim().length < 3 || business_name.trim().length > 50) return res.status(400).json({ ok: false, error: 'Business name 3 theke 50 akkhor hote hobe' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const w = Math.max(wait(ipHits, ip), wait(numHits, number));
  if (w > 0) return res.status(429).json({ ok: false, wait: w, error: `আবার পাঠাতে ${w} সেকেন্ড অপেক্ষা করুন` });

  const fail = (status, error, raw) => {
    ipHits.delete(ip); numHits.delete(number); // failed attempts don't burn the cooldown
    return res.status(status).json({ ok: false, error, raw });
  };

  const payload = {
    name: name.trim(),
    phone_number: '+88' + number,
    business_name: business_name.trim()
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch('https://api-merchant.carrybee.com/api/v2/merchant/register', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Origin': 'https://merchant.carrybee.com',
        'Referer': 'https://merchant.carrybee.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      body: JSON.stringify(payload)
    });
    clearTimeout(timer);

    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch (_) {}

    if (!j) return fail(502, 'API invalid response (HTTP ' + r.status + ')', text.slice(0, 300));

    if (!r.ok || j.success === false) {
      return fail(200, j.message || ('API error (HTTP ' + r.status + ')'), j);
    }

    // success: this request did consume the cooldown, so set it
    ipHits.set(ip, Date.now());
    numHits.set(number, Date.now());
    try {
      await logToGithub(data => {
        data.messages.push({ name: payload.name, number, business_name: payload.business_name, time: new Date().toISOString() });
      });
    } catch (_) { /* logging is best-effort, never block the user's response */ }
    return res.status(200).json({ ok: true, message: j.message || 'Message sent', raw: j });
  } catch (e) {
    return fail(500, e.name === 'AbortError' ? 'API timeout (15s)' : 'Connect failed: ' + (e.cause?.code || e.message));
  }
}
