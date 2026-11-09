// GET /api/visit — increments and returns a visit counter stored in a JSON
// file inside this GitHub repo (via the GitHub Contents API), so you can
// open it on GitHub anytime to see total visits and logged messages.
//
// Requires these Vercel Environment Variables (Project Settings > Environment Variables):
//   GITHUB_TOKEN  - a GitHub Personal Access Token with "repo contents: write" on this repo
//   GITHUB_REPO   - "your-username/your-repo" (e.g. "eftyhasan/bulk-api")
//   GITHUB_BRANCH - optional, defaults to "main"
//   GITHUB_PATH   - optional, defaults to "data/stats.json"
//
// If these aren't set, the counter just returns null (site still works fine).

export async function logToGithub(mutate) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';
  const path = process.env.GITHUB_PATH || 'data/stats.json';
  if (!token || !repo) return { ok: false, reason: 'not_configured' };

  const api = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'bogura-breakup-zone' };

  let sha = null, data = { visits: 0, messages: [] };
  const getRes = await fetch(`${api}?ref=${branch}`, { headers });
  if (getRes.status === 200) {
    const j = await getRes.json();
    sha = j.sha;
    try { data = JSON.parse(Buffer.from(j.content, 'base64').toString('utf-8')); } catch (_) {}
    if (!Array.isArray(data.messages)) data.messages = [];
    if (typeof data.visits !== 'number') data.visits = 0;
  }

  mutate(data);
  if (data.messages.length > 300) data.messages = data.messages.slice(-300); // keep file small

  const body = {
    message: `update stats (visits: ${data.visits})`,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch
  };
  if (sha) body.sha = sha;

  const put = await fetch(api, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!put.ok) return { ok: false, reason: 'github_error_' + put.status, data };
  return { ok: true, data };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const result = await logToGithub(data => { data.visits += 1; });
    if (!result.ok) return res.status(200).json({ ok: false, visits: null, reason: result.reason });
    return res.status(200).json({ ok: true, visits: result.data.visits });
  } catch (e) {
    return res.status(200).json({ ok: false, visits: null, reason: e.message });
  }
}
