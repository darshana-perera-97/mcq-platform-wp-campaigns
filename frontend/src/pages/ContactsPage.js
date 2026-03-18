import { useEffect, useMemo, useState } from 'react';

function getApiBase() {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:3366';
}

async function fetchContacts({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/whatsapp/contacts`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

async function refreshContacts({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/whatsapp/contacts?refresh=1`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

export default function ContactsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    async function load() {
      try {
        const json = await fetchContacts({ signal: ac.signal });
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

  const contacts = Array.isArray(data?.contacts) ? data.contacts : [];
  const cache = data?.cache || null;
  const total = contacts.length;
  const withNumber = contacts.reduce((acc, c) => acc + (c?.number ? 1 : 0), 0);
  const withoutNumber = total - withNumber;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = contacts.slice(start, end);

  useEffect(() => {
    // Keep page within bounds when count/pageSize changes.
    if (page !== safePage) setPage(safePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, pageSize]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      const json = await refreshContacts();
      setData(json);
      setError(null);
      setPage(1);
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
          <h2 className="pageTitle">Contacts</h2>
          <p className="pageSubtitle">
            Unique non-admin members from your joined WhatsApp groups. Backend: <span className="mono">{apiBase}</span>
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
          <div className="badge" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted">Page size</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setPageSize(Number.isFinite(n) ? n : 50);
                setPage(1);
              }}
              style={{
                border: '1px solid rgba(15, 23, 42, 0.12)',
                borderRadius: 10,
                padding: '6px 8px',
                background: 'white',
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="navLink"
            style={{ cursor: refreshing ? 'not-allowed' : 'pointer' }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="badge">{data?.count ?? contacts.length}</span>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <div className="alert">
          <div className="alertTitle">Could not load contacts</div>
          <div className="rowValue">{error}</div>
          <div className="muted" style={{ marginTop: 8 }}>
            Tip: open <span className="mono">/whatsapp</span> and make sure the client state is <span className="mono">ready</span>.
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
        <span className="badge">
          With number: <span className="mono">{withNumber}</span>
        </span>
        <span className="badge">
          Unknown number: <span className="mono">{withoutNumber}</span>
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div className="muted">
          Showing <span className="mono">{total === 0 ? 0 : start + 1}</span>–<span className="mono">{Math.min(end, total)}</span>{' '}
          of <span className="mono">{total}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="navLink"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            style={{ cursor: safePage <= 1 ? 'not-allowed' : 'pointer' }}
          >
            Prev
          </button>
          <span className="badge">
            Page <span className="mono">{safePage}</span> / <span className="mono">{totalPages}</span>
          </span>
          <button
            type="button"
            className="navLink"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            style={{ cursor: safePage >= totalPages ? 'not-allowed' : 'pointer' }}
          >
            Next
          </button>
        </div>
      </div>

      <div className="tableWrap" style={{ marginTop: 12 }}>
        <table className="tableGrid">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Push name</th>
              <th style={{ width: '28%' }}>Name</th>
              <th style={{ width: '18%' }}>Number</th>
              <th>Contact ID</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted" style={{ padding: 14 }}>
                  No contacts found yet (or WhatsApp not ready yet).
                </td>
              </tr>
            ) : (
              pageItems.map((c) => (
                <tr key={c.id || c.number || c.pushname || c.name}>
                  <td style={{ fontWeight: 600 }}>{c.pushname || '—'}</td>
                  <td>{c.name || '—'}</td>
                  <td className="mono">{c.number || '—'}</td>
                  <td className="mono">{c.id || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

