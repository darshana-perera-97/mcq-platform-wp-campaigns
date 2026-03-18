import { useEffect, useMemo, useState } from 'react';

function getApiBase() {
  return process.env.REACT_APP_BACKEND_URL || 'http://localhost:3366';
}

async function fetchCampaigns({ signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/campaigns`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

async function createCampaign({ name, text, mediaFile }) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('text', text);
  if (mediaFile) fd.append('media', mediaFile);

  const res = await fetch(`${getApiBase()}/api/campaigns`, { method: 'POST', body: fd });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

async function fetchCampaign(id, { signal } = {}) {
  const res = await fetch(`${getApiBase()}/api/campaigns/${id}`, { signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

async function deleteCampaign(id) {
  const res = await fetch(`${getApiBase()}/api/campaigns/${id}`, { method: 'DELETE' });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

function isVideoMime(mime) {
  return typeof mime === 'string' && mime.startsWith('video/');
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function CampaignsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailsError, setDetailsError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState(null);

  const apiBase = useMemo(() => getApiBase(), []);

  async function load({ signal } = {}) {
    try {
      const json = await fetchCampaigns({ signal });
      setData(json);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    load({ signal: ac.signal });
    return () => ac.abort();
  }, []);

  const campaigns = Array.isArray(data?.campaigns) ? data.campaigns : [];

  function resetForm() {
    setName('');
    setText('');
    setMediaFile(null);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const n = name.trim();
    const t = text.trim();
    if (!n || !t) {
      setError('Campaign name and text are required.');
      return;
    }

    setSaving(true);
    try {
      await createCampaign({ name: n, text: t, mediaFile });
      setModalOpen(false);
      resetForm();
      setLoading(true);
      await load();
    } catch (e2) {
      setError(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteSelected() {
    if (!selectedId) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Delete this campaign? This cannot be undone.');
    if (!ok) return;

    setDeleting(true);
    try {
      await deleteCampaign(selectedId);
      setDetailsOpen(false);
      setSelectedId(null);
      setSelected(null);
      setLoading(true);
      await load();
    } catch (e) {
      setDetailsError(e?.message || String(e));
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!detailsOpen || !selectedId) return undefined;
    let alive = true;
    const ac = new AbortController();

    async function loadDetails() {
      try {
        const json = await fetchCampaign(selectedId, { signal: ac.signal });
        if (!alive) return;
        setSelected(json.campaign);
        setDetailsError(null);
      } catch (e) {
        if (!alive) return;
        setDetailsError(e?.message || String(e));
      }
    }

    loadDetails();
    const t = setInterval(loadDetails, 2500);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(t);
    };
  }, [detailsOpen, selectedId]);

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <h2 className="pageTitle">Campaigns</h2>
          <p className="pageSubtitle">
            Create message campaigns (with optional image/video). Backend: <span className="mono">{apiBase}</span>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="primaryBtn"
            onClick={() => {
              setError(null);
              setModalOpen(true);
            }}
          >
            Add a Campaign
          </button>
          <span className="badge">{campaigns.length}</span>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : null}
      {error ? (
        <div className="alert">
          <div className="alertTitle">Notice</div>
          <div className="rowValue">{error}</div>
        </div>
      ) : null}

      <div className="cardsGrid" style={{ marginTop: 14 }}>
        {campaigns.length === 0 ? (
          <div className="muted">No campaigns yet.</div>
        ) : (
          campaigns.map((c) => {
            const mediaUrl = c?.media?.url ? `${apiBase}${c.media.url}` : null;
            const mime = c?.media?.mimetype || '';
            const send = c?.send || null;
            const state = send?.state || '—';
            const total = typeof send?.total === 'number' ? send.total : null;
            const sent = typeof send?.sent === 'number' ? send.sent : null;
            const badge =
              state === 'completed' ? 'badgeOk' : state === 'running' || state === 'queued' ? 'badgeWarn' : 'badgeErr';
            return (
              <button
                key={c.id}
                type="button"
                className="miniCard"
                style={{ textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  setSelectedId(c.id);
                  setSelected(null);
                  setDetailsError(null);
                  setDetailsOpen(true);
                }}
              >
                <div className="cardMeta">
                  <div className="cardTitle clamp2">{c.name}</div>
                  <span className="badge">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</span>
                </div>
                <div className="muted clamp4" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                  {c.text}
                </div>

                {mediaUrl ? (
                  <div className="mediaBox" style={{ marginTop: 12 }}>
                    {isVideoMime(mime) ? (
                      <video src={mediaUrl} controls className="mediaPreview" />
                    ) : (
                      <img src={mediaUrl} alt="Campaign media" className="mediaPreview" />
                    )}
                  </div>
                ) : null}

                <div className="cardFooter">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${badge}`}>{state}</span>
                    {total != null && sent != null ? (
                      <span className="badge">
                        <span className="mono">{sent}</span>/<span className="mono">{total}</span> sent
                      </span>
                    ) : null}
                  </div>
                  <span className="navLink" style={{ padding: '8px 10px' }}>
                    View →
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {detailsOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailsOpen(false);
          }}
        >
          <div className="modalCard">
            <div className="cardHeader" style={{ marginBottom: 8 }}>
              <div>
                <h2 className="pageTitle" style={{ marginBottom: 2 }}>
                  Campaign analytics
                </h2>
                <p className="pageSubtitle" style={{ marginBottom: 0 }}>
                  Live status while sending in background.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  type="button"
                  className="navLink"
                  onClick={onDeleteSelected}
                  disabled={deleting}
                  style={{ borderColor: 'rgba(239, 68, 68, 0.25)', background: 'rgba(239, 68, 68, 0.08)' }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" className="navLink" onClick={() => setDetailsOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            {detailsError ? (
              <div className="alert">
                <div className="alertTitle">Could not load analytics</div>
                <div className="rowValue">{detailsError}</div>
              </div>
            ) : null}

            {selected ? (
              <div className="table" style={{ marginTop: 10 }}>
                {(() => {
                  const send = selected.send || {};
                  const total = Number.isFinite(send.total) ? send.total : 0;
                  const sent = Number.isFinite(send.sent) ? send.sent : 0;
                  const failed = Number.isFinite(send.failed) ? send.failed : 0;
                  const currentIndex = Number.isFinite(send.currentIndex) ? send.currentIndex : 0;
                  const processed = Math.min(total, Math.max(0, currentIndex));
                  const remaining = Math.max(0, total - processed);
                  const successRate = processed > 0 ? Math.round((sent / processed) * 100) : null;
                  const etaMs = remaining * 60_000;
                  const recent = Array.isArray(send.recentSends) ? send.recentSends.slice(0, 10) : [];

                  return (
                    <>
                <div className="row">
                  <div className="rowLabel">name</div>
                  <div className="rowValue">{selected.name}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">state</div>
                  <div className="rowValue">{selected.send?.state || '—'}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">progress</div>
                  <div className="rowValue">
                    <span className="mono">{selected.send?.sent ?? 0}</span> sent •{' '}
                    <span className="mono">{selected.send?.failed ?? 0}</span> failed •{' '}
                    <span className="mono">
                      {Math.max(0, (selected.send?.total ?? 0) - (selected.send?.currentIndex ?? 0))}
                    </span>{' '}
                    pending
                  </div>
                </div>
                <div className="row">
                  <div className="rowLabel">success rate</div>
                  <div className="rowValue">{successRate == null ? '—' : `${successRate}%`}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">ETA (approx)</div>
                  <div className="rowValue">{remaining === 0 ? '—' : formatDuration(etaMs)}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">total contacts</div>
                  <div className="rowValue">{selected.send?.total ?? '—'}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">startedAt</div>
                  <div className="rowValue">{selected.send?.startedAt || '—'}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">finishedAt</div>
                  <div className="rowValue">{selected.send?.finishedAt || '—'}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">nextSendAt</div>
                  <div className="rowValue">{selected.send?.nextSendAt || '—'}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">lastContactId</div>
                  <div className="rowValue">{selected.send?.lastContactId || '—'}</div>
                </div>
                <div className="row">
                  <div className="rowLabel">lastError</div>
                  <div className="rowValue">{selected.send?.lastError || '—'}</div>
                </div>

                <div className="row">
                  <div className="rowLabel">recent activity</div>
                  <div className="rowValue">
                    {recent.length === 0 ? (
                      '—'
                    ) : (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {recent.map((e, idx) => (
                          <div key={`${e.at}-${idx}`} className="badge" style={{ justifyContent: 'space-between', gap: 12 }}>
                            <span className="mono">{e.at}</span>
                            <span className="mono">{e.contactId}</span>
                            <span className={`badge ${e.ok ? 'badgeOk' : 'badgeErr'}`}>{e.ok ? 'sent' : 'failed'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="muted">Loading…</p>
            )}
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="modalOverlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="modalCard">
            <div className="cardHeader" style={{ marginBottom: 8 }}>
              <div>
                <h2 className="pageTitle" style={{ marginBottom: 2 }}>
                  Add a Campaign
                </h2>
                <p className="pageSubtitle" style={{ marginBottom: 0 }}>
                  Name, message text, and optional image/video.
                </p>
              </div>
              <button type="button" className="navLink" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>

            <form onSubmit={onSubmit} className="formGrid">
              <label className="field">
                <div className="fieldLabel">Campaign name</div>
                <input
                  className="textInput"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Eid Offer"
                  maxLength={120}
                  required
                />
              </label>

              <label className="field">
                <div className="fieldLabel">Text</div>
                <textarea
                  className="textArea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Your campaign message…"
                  rows={5}
                  required
                />
              </label>

              <label className="field">
                <div className="fieldLabel">Image / Video (optional)</div>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setMediaFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                />
                {mediaFile ? <div className="muted mono">Selected: {mediaFile.name}</div> : null}
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className="navLink" onClick={() => setModalOpen(false)} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="primaryBtn" disabled={saving}>
                  {saving ? 'Saving…' : 'Create campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

