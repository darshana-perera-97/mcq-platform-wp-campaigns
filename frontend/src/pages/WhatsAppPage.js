import { useEffect, useMemo, useState } from 'react';

function getApiBase() {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:3366';
}

async function fetchWhatsAppStatus({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/whatsapp/status`, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return res.json();
}

function Row({ label, value }) {
  return (
    <div className="row">
      <div className="rowLabel">{label}</div>
      <div className="rowValue">{value ?? '—'}</div>
    </div>
  );
}

export default function WhatsAppPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    async function load() {
      try {
        const json = await fetchWhatsAppStatus({ signal: ac.signal });
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
    const t = setInterval(load, 2500);

    return () => {
      alive = false;
      ac.abort();
      clearInterval(t);
    };
  }, []);

  const info = data?.info || null;
  const state = data?.state || '—';
  const badgeClass =
    state === 'ready'
      ? 'badgeOk'
      : state === 'qr' || state === 'authenticated'
        ? 'badgeWarn'
        : state === 'already_running' || state === 'browser_already_running' || state === 'init_error'
          ? 'badgeErr'
          : '';

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h2 className="pageTitle">WhatsApp</h2>
          <p className="pageSubtitle">
            Backend: <span className="mono">{apiBase}</span>
          </p>
        </div>
        <span className={`badge ${badgeClass}`}>{state}</span>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <div className="alert">
          <div className="alertTitle">Could not load status</div>
          <div className="rowValue">{error}</div>
        </div>
      ) : null}

      <div className="table" style={{ marginTop: 10 }}>
        <Row label="pushname" value={info?.pushname} />
        <Row label="wid" value={info?.wid} />
        <Row label="me" value={info?.me} />
        <Row label="platform" value={info?.platform} />
        <Row label="lastError" value={data?.lastError} />
        <Row label="lastQrAt" value={data?.timestamps?.lastQrAt} />
        <Row label="authenticatedAt" value={data?.timestamps?.authenticatedAt} />
        <Row label="readyAt" value={data?.timestamps?.readyAt} />
        <Row label="disconnectedAt" value={data?.timestamps?.disconnectedAt} />
        <Row label="disconnectedReason" value={data?.disconnectedReason} />
      </div>
    </div>
  );
}

