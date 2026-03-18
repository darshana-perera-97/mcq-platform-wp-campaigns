import { useEffect, useMemo, useState } from 'react';

function getApiBase() {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:3366';
}

async function fetchGroups({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/whatsapp/groups`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

async function refreshGroups({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/whatsapp/groups?refresh=1`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

export default function GroupsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    async function load() {
      try {
        const json = await fetchGroups({ signal: ac.signal });
        if (!alive) return;
        setData(json);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(e?.message || String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 3000);

    return () => {
      alive = false;
      ac.abort();
      clearInterval(t);
    };
  }, []);

  const groups = Array.isArray(data?.groups) ? data.groups : [];
  const cache = data?.cache || null;

  async function onRefresh() {
    setRefreshing(true);
    try {
      const json = await refreshGroups();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h2 className="pageTitle">Groups</h2>
          <p className="pageSubtitle">
            WhatsApp groups connected to this account. Backend: <span className="mono">{apiBase}</span>
          </p>
          {cache ? (
            <p className="pageSubtitle" style={{ marginTop: -10, marginBottom: 0 }}>
              Cache:{' '}
              <span className="mono">
                {cache.refreshing ? 'refreshing' : 'idle'}
                {cache.lastUpdatedAt ? ` • updated ${cache.lastUpdatedAt}` : ''}
              </span>
              {cache.lastError ? (
                <>
                  {' '}
                  • <span className="mono">{cache.lastError}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="navLink"
            style={{ cursor: refreshing ? 'not-allowed' : 'pointer' }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="badge">{data?.count ?? groups.length}</span>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <div className="alert">
          <div className="alertTitle">Could not load groups</div>
          <div className="rowValue">{error}</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Tip: open <span className="mono">/whatsapp</span> and make sure the client state is <span className="mono">ready</span>.
          </div>
        </div>
      ) : null}

      <div className="tableWrap" style={{ marginTop: 12 }}>
        <table className="tableGrid">
          <thead>
            <tr>
              <th style={{ width: '48%' }}>Group</th>
              <th style={{ width: '20%' }}>Participants</th>
              <th>Group ID</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted" style={{ padding: 14 }}>
                  No groups found (or WhatsApp not ready yet).
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.id || g.name}>
                  <td style={{ fontWeight: 600 }}>{g.name || '—'}</td>
                  <td className="mono">{g.participants ?? '—'}</td>
                  <td className="mono">{g.id || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

