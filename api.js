/* ============================================================
   SpendWise — API client (frontend → backend)
   Backend URL: same origin by default (when served by the backend).
   If you host the frontend separately (or open index.html directly),
   set window.SPENDWISE_API_BASE before this script, e.g.
     <script>window.SPENDWISE_API_BASE='http://localhost:3000';</script>
   ============================================================ */
const API_BASE = window.SPENDWISE_API_BASE || (location.protocol === 'file:' ? 'http://localhost:3000' : '');

const api = (() => {
  let token = null;

  async function request(method, path, body, asBlob) {
    let res;
    try {
      res = await fetch(API_BASE + '/api' + path, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error('Cannot reach the SpendWise server. Is the backend running?');
    }
    if (asBlob && res.ok) return res.blob();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ').');
    return data;
  }

  return {
    setToken: t => { token = t; },
    get: p => request('GET', p),
    post: (p, b) => request('POST', p, b || {}),
    put: (p, b) => request('PUT', p, b || {}),
    patch: (p, b) => request('PATCH', p, b || {}),
    del: p => request('DELETE', p),
    blob: p => request('GET', p, undefined, true),
  };
})();
