import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

function getApiBase() {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:3366';
}

async function fetchDashboard({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/dashboard`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

function StatCard({ label, value, sub, action }) {
  return (
    <div className="statCard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div className="statLabel">{label}</div>
        {action}
      </div>
      <div className="statValue">{value}</div>
      {sub ? <div className="statSub">{sub}</div> : null}
    </div>
  );
}

export default function HomeDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    async function load() {
      try {
        const json = await fetchDashboard({ signal: ac.signal });
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

  const counts = data?.counts || {};
  const wa = data?.whatsapp || {};
  const refresh = data?.refresh || {};

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h2 className="pageTitle">Dashboard</h2>
          <p className="pageSubtitle">
            Quick analytics view. Backend: <span className="mono">{apiBase}</span>
          </p>
        </div>
        <span className="badge">{wa?.state || '—'}</span>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <div className="alert">
          <div className="alertTitle">Could not load dashboard</div>
          <div className="rowValue">{error}</div>
        </div>
      ) : null}

      <div className="dashGrid" style={{ marginTop: 14 }}>
        <StatCard
          label="WhatsApp"
          value={wa?.state || '—'}
          sub={
            <>
              <span className="badge">readyAt: <span className="mono">{wa?.readyAt || '—'}</span></span>
              {wa?.lastError ? <span className="badge badgeErr">error: <span className="mono">{wa.lastError}</span></span> : null}
            </>
          }
          action={
            <Link className="navLink" to="/whatsapp">
              Details
            </Link>
          }
        />

        <StatCard
          label="Groups"
          value={counts.groups ?? '—'}
          sub={
            <>
              <span className="badge">
                refreshed: <span className="mono">{refresh?.groups?.lastUpdatedAt || '—'}</span>
              </span>
              {refresh?.groups?.refreshing ? <span className="badge badgeWarn">refreshing</span> : null}
              {refresh?.groups?.lastError ? (
                <span className="badge badgeErr">
                  <span className="mono">{refresh.groups.lastError}</span>
                </span>
              ) : null}
            </>
          }
          action={
            <Link className="navLink" to="/groups">
              View
            </Link>
          }
        />

        <StatCard
          label="Contacts"
          value={counts.contacts ?? '—'}
          sub={
            <>
              <span className="badge">
                with number: <span className="mono">{counts.contactsWithNumber ?? '—'}</span>
              </span>
              <span className="badge">
                unknown: <span className="mono">{counts.contactsWithoutNumber ?? '—'}</span>
              </span>
              <span className="badge">
                refreshed: <span className="mono">{refresh?.contacts?.lastUpdatedAt || '—'}</span>
              </span>
              {refresh?.contacts?.refreshing ? <span className="badge badgeWarn">refreshing</span> : null}
            </>
          }
          action={
            <Link className="navLink" to="/contacts">
              View
            </Link>
          }
        />

        <StatCard
          label="Campaigns"
          value={counts.campaigns ?? '—'}
          sub={
            <>
              <span className="badge">
                queued: <span className="mono">{counts.campaignsQueued ?? 0}</span>
              </span>
              <span className="badge">
                running: <span className="mono">{counts.campaignsRunning ?? 0}</span>
              </span>
              <span className="badge">
                completed: <span className="mono">{counts.campaignsCompleted ?? 0}</span>
              </span>
            </>
          }
          action={
            <Link className="navLink" to="/campaigns">
              Manage
            </Link>
          }
        />
      </div>
    </div>
  );
}

