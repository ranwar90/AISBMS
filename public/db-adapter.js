/**
 * Replaces the claude.ai artifact runtime (window.claude.use('db' | 'downloads')) with
 * the Netlify API in /api/db, keeping the exact same interface so the app code is unchanged.
 * Other teachers' changes arrive by polling every 15 s while the tab is visible, and
 * immediately when the tab regains focus; your own changes apply instantly.
 */
(function () {
  const API = '/api/db';
  const POLL_MS = 15000;
  const KEY_STORAGE = 'g8_access_key';
  const cols = {}, etags = {}, listeners = [];
  let pollTimer = null, inFlight = null;

  function accessKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; } }
  function askKey(msg) {
    const k = window.prompt((msg ? msg + '\n\n' : '') + 'Enter the school access key for the G8 Discipline Tracker (ask your admin):', '');
    if (k) { try { localStorage.setItem(KEY_STORAGE, k.trim()); } catch (e) {} }
    return !!k;
  }
  async function call(method, body, query) {
    for (let tries = 0; tries < 3; tries++) {
      if (!accessKey() && !askKey()) throw new Error('No access key');
      const res = await fetch(API + (query || ''), {
        method, headers: { 'content-type': 'application/json', 'x-access-key': accessKey() },
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
      });
      if (res.status === 401) { try { localStorage.removeItem(KEY_STORAGE); } catch (e) {} if (!askKey('That access key was not accepted.')) throw new Error('No access key'); continue; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const err = new Error(data.message || data.error || ('HTTP ' + res.status)); err.code = data.error; err.status = res.status; throw err; }
      return data;
    }
    throw new Error('Access denied');
  }

  function snapshotFor(l) {
    const docs = cols[l.coll] || {};
    if (l.id) return { exists: l.id in docs, id: l.id, data: () => docs[l.id] };
    return { docs: Object.keys(docs).map(id => ({ id, data: () => docs[id] })) };
  }
  function apply(name, etag, docs) {
    cols[name] = docs; etags[name] = etag;
    listeners.filter(l => l.coll === name).forEach(l => { try { l.cb(snapshotFor(l)); } catch (e) { console.error(e); } });
  }
  async function poll() {
    if (inFlight) return inFlight;
    const q = '?etags=' + encodeURIComponent(Object.keys(etags).map(k => k + ':' + etags[k]).join(','));
    inFlight = call('GET', null, q).then(r => {
      Object.entries(r.collections || {}).forEach(([name, c]) => apply(name, c.etag, c.docs));
      banner(null);
    }).catch(e => {
      console.error('Sync failed', e);
      listeners.forEach(l => { if (l.err && !cols[l.coll]) l.err(e); });
      banner(Object.keys(cols).length ? 'Offline — changes from other teachers will appear when the connection returns.'
                                      : 'Can\'t reach the database (' + e.message + ').');
    }).finally(() => { inFlight = null; });
    return inFlight;
  }
  function banner(msg) {
    let el = document.getElementById('syncBanner');
    if (!msg) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'syncBanner';
      el.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:999;background:#B91C1C;color:#fff;' +
        'padding:10px 14px;border-radius:10px;font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;max-width:92vw';
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    const t = document.createElement('span'); t.textContent = msg; el.appendChild(t);
    const b1 = document.createElement('button'); b1.textContent = 'Retry'; b1.onclick = () => poll();
    const b2 = document.createElement('button'); b2.textContent = 'Change access key';
    b2.onclick = () => { try { localStorage.removeItem(KEY_STORAGE); } catch (e) {} if (askKey()) poll(); };
    [b1, b2].forEach(b => { b.style.cssText = 'background:#fff;color:#B91C1C;border:0;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer'; el.appendChild(b); });
  }
  function schedule() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => { if (!document.hidden) poll(); schedule(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  window.addEventListener('focus', () => poll());

  function listen(l) {
    listeners.push(l);
    if (cols[l.coll]) setTimeout(() => l.cb(snapshotFor(l)), 0);
    else { poll(); schedule(); }
    return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
  }
  async function write(op, path, data) {
    const r = await call('POST', { op, path, data });
    apply(r.collection, r.etag, r.docs);
  }

  const db = {
    collection: name => ({ onSnapshot: (cb, err) => listen({ coll: name, cb, err }) }),
    doc: path => {
      const [coll, id] = path.split('/');
      return {
        onSnapshot: (cb, err) => listen({ coll, id, cb, err }),
        set: data => write('set', path, data),
        update: data => write('update', path, data),
        delete: () => write('delete', path),
      };
    },
  };

  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };

  window.claude = { use: async name => name === 'db' ? db : name === 'downloads' ? downloads : null };
})();
