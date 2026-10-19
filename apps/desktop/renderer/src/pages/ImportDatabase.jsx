/**
 * ImportDatabase.jsx
 * Two import modes:
 *   1. Full Import  — Convert entire .accdb/.mdb/.sqlite to a new SQLite file
 *   2. COA Import   — Extract only Chart of Accounts, Account Groups and Voucher
 *                     Types from an existing SQLite file into the current database.
 *                     No transaction amounts are imported.
 */
import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, FolderOpen, BookOpen, Database } from 'lucide-react';

const api = window.electronAPI;

// ── Mode tab button ────────────────────────────────────────────────────────────
function ModeTab({ active, onClick, icon: Icon, label, desc }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '14px 20px', border: '2px solid',
        borderColor: active ? 'var(--accent,#3b82f6)' : 'var(--border,#e2e8f0)',
        borderRadius: 10, background: active ? 'rgba(59,130,246,0.07)' : 'var(--bg-card,#fff)',
        cursor: 'pointer', textAlign: isRTL() ? 'right' : 'left', transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Icon size={18} color={active ? 'var(--accent,#3b82f6)' : 'var(--text-muted)'} />
        <span style={{ fontWeight: 700, fontSize: 14, color: active ? 'var(--accent,#3b82f6)' : 'var(--text-primary)' }}>{label}</span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</p>
    </button>
  );
}

function isRTL() { return document.documentElement.dir === 'rtl'; }

export default function ImportDatabase({ currentDb, showNotification, loadDatabases }) {
  // ── Mode: 'full' or 'coa' ─────────────────────────────────────────────────
  const [mode, setMode] = useState('full');

  // ── Full import state ─────────────────────────────────────────────────────
  const [status,   setStatus]   = useState('idle'); // idle|importing|done|error
  const [progress, setProgress] = useState(0);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [dragover, setDragover] = useState(false);

  // ── COA import state ──────────────────────────────────────────────────────
  const [coaStatus,  setCoaStatus]  = useState('idle');
  const [coaResult,  setCoaResult]  = useState(null);
  const [coaError,   setCoaError]   = useState(null);

  // ── Full import ───────────────────────────────────────────────────────────
  async function handleFullImport(filePath) {
    if (!filePath) return;
    setStatus('importing'); setProgress(10); setError(null); setResult(null);
    try {
      setProgress(30);
      const res = await api.importAccdb(filePath);
      setProgress(90);
      if (res.success) {
        setResult(res); setStatus('done'); setProgress(100);
        showNotification('Database imported successfully!', 'success');
        if (loadDatabases) loadDatabases();
      } else { setError(res.error || 'Import failed.'); setStatus('error'); }
    } catch (e) { setError(e.message); setStatus('error'); }
  }

  async function handleBrowseFull() {
    const filePath = await api.selectFile({
      filters: [
        { name: 'Access / SQLite Databases', extensions: ['accdb', 'mdb', 'sqlite'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (filePath) handleFullImport(filePath);
  }

  // ── COA-only import ───────────────────────────────────────────────────────
  async function handleCOAImport() {
    if (!currentDb) { showNotification('Open a target database first', 'error'); return; }
    const sourcePath = await api.selectFile({
      filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
    });
    if (!sourcePath) return;
    if (sourcePath === currentDb) {
      showNotification('Source and target cannot be the same file', 'error'); return;
    }

    setCoaStatus('importing'); setCoaError(null); setCoaResult(null);
    try {
      const res = await api.importChartOfAccountsOnly({ sourcePath, targetPath: currentDb });
      if (res.success) {
        setCoaResult(res.result); setCoaStatus('done');
        showNotification('Chart of Accounts imported successfully!', 'success');
      } else { setCoaError(res.error || 'Import failed'); setCoaStatus('error'); }
    } catch (e) { setCoaError(e.message); setCoaStatus('error'); }
  }

  return (
    <div className="page import-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Database</h1>
          <p className="page-subtitle">Import an Access database or extract Chart of Accounts only</p>
        </div>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        <ModeTab active={mode === 'full'} onClick={() => setMode('full')}
          icon={Database} label="Full Database Import"
          desc="Convert a Microsoft Access (.accdb / .mdb) or SQLite file — all tables and data." />
        <ModeTab active={mode === 'coa'} onClick={() => setMode('coa')}
          icon={BookOpen} label="Chart of Accounts Only"
          desc="Extract only account groups, chart of accounts and voucher types from a SQLite file. No amounts or transactions." />
      </div>

      {/* ─────────────────────────────────────── FULL IMPORT ─────────────── */}
      {mode === 'full' && (
        <>
          {status === 'idle' || status === 'error' ? (
            <>
              <div
                className={`drop-zone ${dragover ? 'dragover' : ''}`}
                onClick={handleBrowseFull}
                onDragOver={e => { e.preventDefault(); setDragover(true); }}
                onDragLeave={() => setDragover(false)}
                onDrop={e => {
                  e.preventDefault(); setDragover(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFullImport(file.path);
                }}
              >
                <div className="drop-zone-icon">📂</div>
                <h3>Drop an .accdb, .mdb, or .sqlite file here</h3>
                <p>or click to browse your files</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={e => { e.stopPropagation(); handleBrowseFull(); }}>
                  <FolderOpen size={14} /> Browse Files
                </button>
              </div>
              {error && (
                <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} /> {error}
                </div>
              )}
              <div className="settings-section">
                <h3>How it works</h3>
                <div className="setting-row"><div className="setting-info">
                  <span className="setting-label">1. Select file</span>
                  <span className="setting-desc">Browse for your .accdb, .mdb, or .sqlite database file</span>
                </div></div>
                <div className="setting-row"><div className="setting-info">
                  <span className="setting-label">2. Auto-convert</span>
                  <span className="setting-desc">All tables and data are copied into a new SQLite file alongside your existing databases</span>
                </div></div>
                <div className="setting-row"><div className="setting-info">
                  <span className="setting-label">3. Open & migrate</span>
                  <span className="setting-desc">The new SQLite is opened and ERP schema migration runs automatically</span>
                </div></div>
              </div>
            </>
          ) : status === 'importing' ? (
            <div className="import-progress">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                <span style={{ fontSize: 14 }}>Importing database, please wait…</span>
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{progress}% complete</span>
            </div>
          ) : status === 'done' && result ? (
            <div className="import-progress">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: 'var(--emerald)' }}>
                <CheckCircle size={20} /><span style={{ fontSize: 15, fontWeight: 600 }}>Import Successful</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                <strong>Output:</strong> {result.sqlitePath}
              </div>
              {result.tables && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <strong>Tables imported:</strong> {result.tables.length}
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {result.tables.slice(0, 20).map(t => (
                      <span key={t} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{t}</span>
                    ))}
                    {result.tables.length > 20 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{result.tables.length - 20} more</span>}
                  </div>
                </div>
              )}
              <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => { setStatus('idle'); setResult(null); }}>
                Import Another
              </button>
            </div>
          ) : null}
        </>
      )}

      {/* ──────────────────────────── COA-ONLY IMPORT ──────────────────────── */}
      {mode === 'coa' && (
        <div>
          {/* Info banner */}
          <div style={{
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: 13,
          }}>
            <strong style={{ display: 'block', marginBottom: 6 }}>⚡ What gets imported:</strong>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
              <li><strong>tblAccHead</strong> — Account head hierarchy (Capital, Liabilities, Assets, Income, Expenses)</li>
              <li><strong>tblSubAcc</strong> — Account sub-groups (without amounts)</li>
              <li><strong>AC</strong> — Chart of Accounts (account names, codes — no balances)</li>
              <li><strong>VT + 5VT</strong> — Voucher type definitions and posting rules</li>
            </ul>
            <strong style={{ display: 'block', marginTop: 8, color: 'var(--rose)' }}>✗ What is NOT imported:</strong>
            <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, color: 'var(--text-muted)' }}>
              <li>Transaction tables (T, Inv, T1, Inv1) — no amounts or balances</li>
              <li>Any other operational tables</li>
            </ul>
          </div>

          {!currentDb && (
            <div className="error-banner" style={{ marginBottom: 16 }}>
              ⚠️ Open a target database first. The COA will be imported into the currently open database.
            </div>
          )}

          {coaStatus === 'idle' || coaStatus === 'error' ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div className="drop-zone" style={{ cursor: currentDb ? 'pointer' : 'not-allowed', opacity: currentDb ? 1 : 0.5 }}
                onClick={currentDb ? handleCOAImport : undefined}>
                <div className="drop-zone-icon"><BookOpen size={48} /></div>
                <h3>Select a source SQLite file</h3>
                <p>The Chart of Accounts structure will be merged into: <br />
                  <code style={{ fontSize: 12, background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
                    {currentDb ? currentDb.split('/').pop() : 'No database open'}
                  </code>
                </p>
                <button className="btn btn-primary" style={{ marginTop: 16 }}
                  disabled={!currentDb}
                  onClick={e => { e.stopPropagation(); if (currentDb) handleCOAImport(); }}>
                  <FolderOpen size={14} /> Select Source Database
                </button>
              </div>
              {coaError && (
                <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <AlertCircle size={16} /> {coaError}
                </div>
              )}
            </div>
          ) : coaStatus === 'importing' ? (
            <div className="import-progress">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                <span style={{ fontSize: 14 }}>Extracting Chart of Accounts…</span>
              </div>
            </div>
          ) : coaStatus === 'done' && coaResult ? (
            <div className="import-progress">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, color: 'var(--emerald)' }}>
                <CheckCircle size={20} /><span style={{ fontSize: 15, fontWeight: 600 }}>Chart of Accounts Imported</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
                {Object.entries(coaResult.imported || {}).map(([table, count]) => (
                  <div key={table} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{table}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--emerald)' }}>{count}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>added</div>
                  </div>
                ))}
              </div>
              {coaResult.skipped?.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  <strong>Skipped (already exist):</strong> {coaResult.skipped.slice(0,10).join(', ')}
                  {coaResult.skipped.length > 10 && ` +${coaResult.skipped.length - 10} more`}
                </div>
              )}
              <button className="btn btn-secondary" onClick={() => { setCoaStatus('idle'); setCoaResult(null); }}>
                Import From Another File
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
