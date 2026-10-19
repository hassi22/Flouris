import React, { useState, useEffect } from 'react';
import { Cloud, Upload, Download, RefreshCw, FolderOpen, CheckCircle, AlertCircle, Info, Database, Image, Lock, Eye, EyeOff } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

export default function Settings({ currentDb, showNotification, prefs = {}, setPrefs, loadDatabases, selectDatabase }) {
  const { t, isUrdu } = useLang();
  const [appInfo,        setAppInfo]        = useState(null);
  const [gdrivePath,     setGdrivePath]     = useState(null);
  const [gdriveStatus,   setGdriveStatus]   = useState('unknown');
  const [checking,       setChecking]       = useState(false);
  const [syncing,        setSyncing]        = useState(false);
  const [driveFiles,     setDriveFiles]     = useState([]);
  const [loadingFiles,   setLoadingFiles]   = useState(false);
  const [newDbName,      setNewDbName]      = useState('');
  // Password state
  const [curPw,          setCurPw]          = useState('');
  const [newPw,          setNewPw]          = useState('');
  const [confirmPw,      setConfirmPw]      = useState('');
  const [showPw,         setShowPw]         = useState(false);
  const [pwSaving,       setPwSaving]       = useState(false);
  const dir = isUrdu ? 'rtl' : 'ltr';

  useEffect(() => {
    if (!api) return;
    api.getAppInfo().then(setAppInfo).catch(() => {});
    checkDriveAuto();
  }, []);

  // ── Drive detection ────────────────────────────────────────────────────────
  async function checkDriveAuto() {
    try {
      const p = await api.getGoogleDrivePath();
      setGdrivePath(p);
      setGdriveStatus(p ? 'ok' : 'missing');
      if (p) loadDriveFiles();
    } catch { setGdriveStatus('missing'); }
  }

  async function handleDetect() {
    setChecking(true);
    try {
      const p = await api.getGoogleDrivePath();
      setGdrivePath(p);
      setGdriveStatus(p ? 'ok' : 'missing');
      if (p) {
        showNotification(`Google Drive: ${p}`, 'success');
        loadDriveFiles();
      } else {
        showNotification(isUrdu ? 'گوگل ڈرائیو نہیں ملی' : 'Google Drive not detected', 'error');
      }
    } catch (e) { showNotification(e.message, 'error'); }
    finally { setChecking(false); }
  }

  async function handleBrowse() {
    try {
      const chosen = await api.selectFolder();
      if (!chosen) return;
      await api.savePrefs({ googleDrivePath: chosen });
      setGdrivePath(chosen);
      setGdriveStatus('ok');
      showNotification(isUrdu ? 'گوگل ڈرائیو فولڈر محفوظ ہو گیا' : 'Google Drive folder saved', 'success');
      loadDriveFiles();
    } catch (e) { showNotification(e.message, 'error'); }
  }

  async function handleClearDrive() {
    await api.savePrefs({ googleDrivePath: null });
    setGdrivePath(null);
    setGdriveStatus('missing');
    setDriveFiles([]);
    showNotification(isUrdu ? 'گوگل ڈرائیو پاتھ صاف ہو گئی' : 'Google Drive path cleared', 'info');
  }

  // ── Drive file listing ─────────────────────────────────────────────────────
  async function loadDriveFiles() {
    setLoadingFiles(true);
    try {
      const result = await api.listGDriveDatabases();
      if (result.success) setDriveFiles(result.files || []);
    } catch (_) {}
    finally { setLoadingFiles(false); }
  }

  // ── Upload active DB → Drive ───────────────────────────────────────────────
  async function handleSyncToGDrive() {
    if (!currentDb) {
      showNotification(isUrdu ? 'پہلے کوئی ڈیٹا بیس کھولیں' : 'Open a database first', 'error');
      return;
    }
    setSyncing(true);
    try {
      const result = await api.syncToGDrive({ dbPath: currentDb });
      if (result.success) {
        showNotification(
          isUrdu
            ? `ڈرائیو پر کاپی ہو گیا: ${result.destPath}`
            : `Copied to Drive: ${result.destPath}`,
          'success'
        );
        loadDriveFiles();
        loadDatabases?.();
      } else {
        showNotification(result.error || 'Sync failed', 'error');
      }
    } catch (e) { showNotification(e.message, 'error'); }
    finally { setSyncing(false); }
  }

  // ── Download Drive file → project root ────────────────────────────────────
  async function handleSyncFromGDrive(file) {
    try {
      const result = await api.syncFromGDrive({ filename: file.filename });
      if (result.success) {
        showNotification(
          isUrdu
            ? `مقامی فولڈر میں کاپی ہو گیا: ${file.filename}`
            : `Copied to local folder: ${file.filename}`,
          'success'
        );
        await loadDatabases?.();
        await selectDatabase?.(result.destPath);
      } else {
        showNotification(result.error || 'Download failed', 'error');
      }
    } catch (e) { showNotification(e.message, 'error'); }
  }

  // ── Logo ───────────────────────────────────────────────────────────────────
  async function handleLogo() {
    const chosen = await api.selectFile({ filters: [{ name: 'Logo Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (!chosen) return;
    const image = await api.getImageData(chosen);
    if (!image.success) { showNotification(image.error, 'error'); return; }
    await api.savePrefs({ logoPath: chosen, logoData: image.data });
    setPrefs?.(prev => ({ ...prev, logoPath: chosen, logoData: image.data }));
    showNotification(isUrdu ? 'لوگو محفوظ ہو گیا' : 'Logo saved', 'success');
  }

  async function handleClearLogo() {
    await api.savePrefs({ logoPath: null, logoData: null });
    setPrefs?.(prev => ({ ...prev, logoPath: null, logoData: null }));
    showNotification(isUrdu ? 'لوگو ہٹا دیا گیا' : 'Logo removed', 'info');
  }

  // ── Password ────────────────────────────────────────────────────────────────
  async function handleSetPassword() {
    if (newPw && newPw !== confirmPw) {
      showNotification(isUrdu ? 'نیا پاس ورڈ اور تصدیق مختلف ہیں' : 'New password and confirmation do not match', 'error');
      return;
    }
    if (!currentDb) { showNotification(isUrdu ? 'پہلے ڈیٹا بیس کھولیں' : 'Open a database first', 'error'); return; }
    setPwSaving(true);
    try {
      const res = await api.setPassword({ dbPath: currentDb, currentPassword: curPw || undefined, newPassword: newPw || undefined });
      if (res.success) {
        showNotification(
          newPw
            ? (isUrdu ? 'پاس ورڈ محفوظ ہو گیا' : 'Password saved successfully')
            : (isUrdu ? 'پاس ورڈ ہٹا دیا گیا' : 'Password removed'),
          'success'
        );
        setCurPw(''); setNewPw(''); setConfirmPw('');
      } else {
        showNotification(res.error || 'Failed', 'error');
      }
    } catch (e) { showNotification(e.message, 'error'); }
    finally { setPwSaving(false); }
  }

  // ── Rename ─────────────────────────────────────────────────────────────────
  async function handleRenameDatabase() {
    const name = newDbName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!currentDb || !name) return;
    const result = await api.renameDatabase({ oldPath: currentDb, newName: name });
    if (!result.success) { showNotification(result.error, 'error'); return; }
    setNewDbName('');
    await loadDatabases?.();
    await selectDatabase?.(result.newPath);
    showNotification(isUrdu ? 'ڈیٹا بیس کا نام تبدیل ہو گیا' : 'Database renamed', 'success');
  }

  const driveOk = gdriveStatus === 'ok' && gdrivePath;

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t.settings}</h1>
          <p className="page-subtitle">{isUrdu ? 'ایپلیکیشن ترتیبات' : 'Application preferences and information'}</p>
        </div>
      </div>

      {/* ── Google Drive ──────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3>
          <Cloud size={14} style={{ display:'inline', marginRight:6 }} />
          {isUrdu ? 'گوگل ڈرائیو سنک' : 'Google Drive Sync'}
        </h3>

        {/* Status banner */}
        <div className={`drive-status-banner ${driveOk ? 'drive-ok' : 'drive-missing'}`}>
          {driveOk
            ? <><CheckCircle size={16}/> {isUrdu ? 'گوگل ڈرائیو جڑ گئی' : 'Google Drive connected'} — <span style={{fontFamily:'monospace',fontSize:11,opacity:0.8}}>{gdrivePath}</span></>
            : <><AlertCircle size={16}/> {isUrdu ? 'گوگل ڈرائیو نہیں ملی — نیچے فولڈر منتخب کریں' : 'Google Drive not detected — select folder below'}</>
          }
        </div>

        {/* Drive Path row */}
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-label">{isUrdu ? 'خودکار تلاش' : 'Auto-detect'}</span>
            <span className="setting-desc">{isUrdu ? 'سسٹم میں گوگل ڈرائیو خودکار تلاش کریں' : 'Scan system for Google Drive installation'}</span>
          </div>
          <button className="btn btn-secondary" onClick={handleDetect} disabled={checking}>
            <RefreshCw size={13} className={checking ? 'spin' : ''} />
            {checking ? '…' : (isUrdu ? 'تلاش کریں' : 'Auto-detect')}
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-label">{isUrdu ? 'فولڈر منتخب کریں' : 'Select Manually'}</span>
            <span className="setting-desc">
              {isUrdu
                ? 'اگر خودکار تلاش کام نہ کرے تو اپنا My Drive فولڈر خود منتخب کریں'
                : 'If auto-detect fails, browse to your Google Drive / My Drive folder'}
            </span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" onClick={handleBrowse}>
              <FolderOpen size={13} /> {isUrdu ? 'فولڈر منتخب کریں' : 'Browse…'}
            </button>
            {gdrivePath && (
              <button className="btn btn-ghost" onClick={handleClearDrive}>
                {isUrdu ? 'صاف کریں' : 'Clear'}
              </button>
            )}
          </div>
        </div>

        {/* ── Upload active DB → Drive ─────────────────────────────────── */}
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-label">{isUrdu ? 'ڈرائیو پر اپ لوڈ کریں' : 'Upload to Drive'}</span>
            <span className="setting-desc">
              {isUrdu
                ? 'موجودہ ڈیٹا بیس کو ERA Accounting فولڈر میں کاپی کریں — ڈرائیو ایپ بادل سے سنک کرے گی'
                : 'Copy the active database into the ERA Accounting folder — Drive desktop app syncs it to the cloud'}
            </span>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSyncToGDrive}
            disabled={syncing || !currentDb || !driveOk}
            title={!currentDb ? 'Open a database first' : !driveOk ? 'Connect Google Drive first' : ''}
          >
            <Upload size={13} className={syncing ? 'spin' : ''} />
            {syncing ? (isUrdu ? 'اپ لوڈ ہو رہا ہے…' : 'Uploading…') : (isUrdu ? 'ڈرائیو پر اپ لوڈ' : 'Upload to Drive')}
          </button>
        </div>

        {/* ── Drive file list + download ───────────────────────────────── */}
        {driveOk && (
          <div className="setting-row" style={{ flexDirection:'column', alignItems:'stretch', gap:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span className="setting-label">
                {isUrdu ? 'ERA Accounting ڈرائیو فائلیں' : 'ERA Accounting Drive Files'}
              </span>
              <button className="btn btn-secondary" onClick={loadDriveFiles} disabled={loadingFiles} style={{padding:'4px 10px'}}>
                <RefreshCw size={12} className={loadingFiles ? 'spin' : ''} />
                {isUrdu ? 'تازہ کریں' : 'Refresh'}
              </button>
            </div>

            {loadingFiles ? (
              <p className="setting-desc">{isUrdu ? 'لوڈ ہو رہا ہے…' : 'Loading…'}</p>
            ) : driveFiles.length === 0 ? (
              <p className="setting-desc" style={{fontStyle:'italic'}}>
                {isUrdu ? 'ڈرائیو فولڈر میں کوئی ڈیٹا بیس نہیں' : 'No databases in Drive folder yet'}
              </p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {driveFiles.map(f => (
                  <div key={f.filename} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    background:'var(--bg)', border:'1px solid var(--border)',
                    borderRadius:6, padding:'8px 12px', gap:12,
                  }}>
                    <div>
                      <span style={{fontWeight:600, fontSize:13}}>{f.name}</span>
                      <span style={{fontSize:11, color:'var(--text-muted)', marginLeft:10}}>
                        {f.modified ? new Date(f.modified).toLocaleDateString() : ''}
                        {f.size ? `  ·  ${(f.size/1024).toFixed(0)} KB` : ''}
                      </span>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{padding:'4px 10px'}}
                      onClick={() => handleSyncFromGDrive(f)}
                      title={isUrdu ? 'مقامی فولڈر میں کاپی کریں' : 'Copy to local folder & open'}
                    >
                      <Download size={12} />
                      {isUrdu ? 'ڈاؤنلوڈ' : 'Download'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-label">{isUrdu ? 'سنک طریقہ' : 'Sync Method'}</span>
            <span className="setting-desc">
              {isUrdu
                ? 'گوگل ڈرائیو ڈیسک ٹاپ ایپ فائلیں کلاؤڈ سے سنک کرتی ہے، ERA فائل میں تبدیلیاں خودکار ریفریش کرتا ہے'
                : 'Google Drive desktop app handles cloud sync. ERA watches the file and auto-refreshes on changes.'}
            </span>
          </div>
          <span className="setting-value stat-online">● {isUrdu ? 'فعال' : 'Active'}</span>
        </div>

        {/* Setup instructions when not connected */}
        {!driveOk && (
          <div className="drive-setup-guide">
            <p style={{ fontWeight:600, marginBottom:8 }}>
              {isUrdu ? 'گوگل ڈرائیو سیٹ اپ کیسے کریں:' : 'How to set up Google Drive sync:'}
            </p>
            <ol style={{ paddingInlineStart:20, lineHeight:2 }}>
              <li>{isUrdu ? 'گوگل ڈرائیو ڈیسک ٹاپ ایپ انسٹال کریں: google.com/drive/download' : 'Install Google Drive desktop app from google.com/drive/download'}</li>
              <li>{isUrdu ? 'اپنے گوگل اکاؤنٹ سے سائن ان کریں' : 'Sign in with your Google Account'}</li>
              <li>{isUrdu ? 'ایپ کھلنے کے بعد اوپر "خودکار تلاش" بٹن دبائیں' : 'After the app opens, click Auto-detect above'}</li>
              <li>{isUrdu ? 'یا اپنا My Drive فولڈر "فولڈر منتخب کریں" سے منتخب کریں' : 'Or browse to your My Drive folder manually'}</li>
            </ol>
          </div>
        )}
      </div>

      {/* ── Brand Logo ────────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3><Image size={14} style={{ display:'inline', marginRight:6 }} />{isUrdu ? 'برانڈ لوگو' : 'Brand Logo'}</h3>
        <div className="logo-setting-row">
          <div className="logo-preview">
            {prefs.logoData ? <img src={prefs.logoData} alt="Company logo" /> : <Image size={24} />}
          </div>
          <div className="setting-info">
            <span className="setting-label">{isUrdu ? 'اپنا لوگو استعمال کریں' : 'Use your company logo'}</span>
            <span className="setting-desc">
              {isUrdu
                ? 'PNG، JPG یا WEBP فائل منتخب کریں؛ یہ ایپ اور PDF رپورٹس میں دکھایا جائے گا'
                : 'Choose a PNG, JPG, or WEBP file for the app and PDF reports'}
            </span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" onClick={handleLogo}>
              <FolderOpen size={13} /> {isUrdu ? 'منتخب کریں' : 'Choose Logo'}
            </button>
            {prefs.logoData && (
              <button className="btn btn-ghost" onClick={handleClearLogo}>
                {isUrdu ? 'ہٹائیں' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Active Database ───────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3><Database size={14} style={{ display:'inline', marginRight:6 }} />{isUrdu ? 'فعال ڈیٹا بیس' : 'Active Database'}</h3>
        <div className="setting-row">
          <div className="setting-info"><span className="setting-label">{isUrdu ? 'فائل' : 'Current File'}</span></div>
          <span className="setting-value" style={{ fontFamily:'monospace', fontSize:11, maxWidth:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {currentDb || '—'}
          </span>
        </div>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-label">{isUrdu ? 'فائل کا نام تبدیل کریں' : 'Rename Database File'}</span>
            <span className="setting-desc">{isUrdu ? 'اصل ریکارڈ برقرار رکھتے ہوئے نئی فائل کا نام رکھیں' : 'Rename the database file without changing its records'}</span>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <input className="input-field" value={newDbName} onChange={e => setNewDbName(e.target.value)} placeholder="Company_2026" />
            <button className="btn btn-secondary" onClick={handleRenameDatabase} disabled={!currentDb || !newDbName.trim()}>
              {isUrdu ? 'نام تبدیل' : 'Rename'}
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-info"><span className="setting-label">{isUrdu ? 'پراجیکٹ فولڈر' : 'Project Root'}</span></div>
          <span className="setting-value" style={{ fontFamily:'monospace', fontSize:11 }}>{appInfo?.projectRoot || '—'}</span>
        </div>
      </div>

      {/* ── Password Protection ───────────────────────────────────────────── */}
      <div className="settings-section">
        <h3><Lock size={14} style={{ display:'inline', marginRight:6 }} />{isUrdu ? 'پاس ورڈ حفاظت' : 'Password Protection'}</h3>
        <p style={{ fontSize:12, color:'var(--text-muted)', marginBottom:12 }}>
          {isUrdu
            ? 'پاس ورڈ سیٹ کرنے کے بعد، ڈیٹا بیس کھولتے وقت پاس ورڈ مانگا جائے گا۔ خالی رکھنے پر پاس ورڈ ہٹ جائے گا۔'
            : 'Once set, the database will require this password to open each session. Leave "New Password" empty to remove the password.'}
        </p>
        {!currentDb && (
          <div className="error-banner" style={{ marginBottom:10, fontSize:12 }}>
            {isUrdu ? 'پہلے ڈیٹا بیس کھولیں' : 'Open a database first to manage its password'}
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
          <div className="field-group">
            <label>{isUrdu ? 'موجودہ پاس ورڈ' : 'Current Password'}</label>
            <div style={{ position:'relative' }}>
              <input type={showPw ? 'text' : 'password'} className="input-field"
                style={{ width:'100%', boxSizing:'border-box' }}
                value={curPw}
                placeholder={isUrdu ? 'خالی چھوڑیں اگر کوئی نہیں' : 'Leave blank if none'}
                onChange={e => setCurPw(e.target.value)} />
            </div>
          </div>
          <div className="field-group">
            <label>{isUrdu ? 'نیا پاس ورڈ' : 'New Password'}</label>
            <input type={showPw ? 'text' : 'password'} className="input-field"
              style={{ width:'100%', boxSizing:'border-box' }}
              value={newPw}
              placeholder={isUrdu ? 'خالی = پاس ورڈ ہٹائیں' : 'Empty = remove password'}
              onChange={e => setNewPw(e.target.value)} />
          </div>
          <div className="field-group">
            <label>{isUrdu ? 'نیا پاس ورڈ تصدیق' : 'Confirm New Password'}</label>
            <input type={showPw ? 'text' : 'password'} className="input-field"
              style={{ width:'100%', boxSizing:'border-box' }}
              value={confirmPw}
              placeholder={isUrdu ? 'دہرائیں…' : 'Repeat…'}
              onChange={e => setConfirmPw(e.target.value)} />
          </div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <button className="btn btn-secondary" style={{ padding:'5px 12px', fontSize:12 }}
            onClick={() => setShowPw(v => !v)}>
            {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPw ? (isUrdu ? 'چھپائیں' : 'Hide') : (isUrdu ? 'دکھائیں' : 'Show')}
          </button>
          <button className="btn btn-primary" onClick={handleSetPassword}
            disabled={pwSaving || !currentDb}>
            <Lock size={13} />
            {pwSaving ? '…' : (isUrdu ? 'پاس ورڈ محفوظ کریں' : 'Save Password')}
          </button>
        </div>
      </div>

      {/* ── App Info ──────────────────────────────────────────────────────── */}
      {appInfo && (
        <div className="settings-section">
          <h3><Info size={14} style={{ display:'inline', marginRight:6 }} />{isUrdu ? 'ایپ معلومات' : 'Application Info'}</h3>
          {[
            [isUrdu ? 'ورژن'       : 'App Version',  appInfo.version],
            ['Electron',                               appInfo.electronVersion],
            ['Node.js',                                appInfo.nodeVersion],
            [isUrdu ? 'پلیٹ فارم' : 'Platform',     `${appInfo.platform} (${appInfo.arch})`],
          ].map(([label, value]) => (
            <div className="setting-row" key={label}>
              <div className="setting-info"><span className="setting-label">{label}</span></div>
              <span className="setting-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
