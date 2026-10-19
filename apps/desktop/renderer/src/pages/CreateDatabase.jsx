import React, { useState } from 'react';
import { Plus, Database, CheckCircle, AlertCircle } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

const api = window.electronAPI;

export default function CreateDatabase({ showNotification, loadDatabases, selectDatabase }) {
  const { isUrdu } = useLang();
  const dir = isUrdu ? 'rtl' : 'ltr';

  const [companyName,   setCompanyName]   = useState('');
  const [companyNameUr, setCompanyNameUr] = useState('');
  const [fileName,      setFileName]      = useState('');
  const [creating,      setCreating]      = useState(false);
  const [result,        setResult]        = useState(null); // { success, filePath, error }

  async function handleCreate() {
    if (!companyName.trim()) {
      showNotification(isUrdu ? 'کمپنی کا نام درج کریں' : 'Enter a company name', 'error');
      return;
    }
    setCreating(true);
    setResult(null);
    try {
      const res = await api.createDatabase({
        companyName:   companyName.trim(),
        companyNameUr: companyNameUr.trim(),
        fileName:      (fileName.trim() || companyName.trim()).replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, ''),
      });
      if (res.success) {
        setResult({ success: true, filePath: res.filePath });
        showNotification(isUrdu ? 'ڈیٹا بیس بن گئی' : 'Database created successfully', 'success');
        if (loadDatabases) await loadDatabases();
        if (selectDatabase) selectDatabase(res.filePath);
      } else if (!res.canceled) {
        setResult({ success: false, error: res.error });
        showNotification(res.error || 'Failed to create database', 'error');
      }
    } catch (e) {
      setResult({ success: false, error: e.message });
      showNotification(e.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page" dir={dir}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{isUrdu ? 'نئی ڈیٹا بیس بنائیں' : 'Create New Database'}</h1>
          <p className="page-subtitle">
            {isUrdu
              ? 'ایک نئی کمپنی کے لیے خالی ڈیٹا بیس بنائیں'
              : 'Create a fresh SQLite database with Flouris schema for a new company'}
          </p>
        </div>
      </div>

      {result?.success ? (
        <div className="settings-section">
          <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--emerald)', marginBottom:16 }}>
            <CheckCircle size={22} />
            <span style={{ fontSize:15, fontWeight:700 }}>
              {isUrdu ? 'ڈیٹا بیس کامیابی سے بن گئی!' : 'Database created successfully!'}
            </span>
          </div>
          <div style={{ fontSize:12, color:'var(--text-muted)', fontFamily:'monospace', marginBottom:18 }}>
            {result.filePath}
          </div>
          <button className="btn btn-primary" onClick={() => { setResult(null); setCompanyName(''); setCompanyNameUr(''); setFileName(''); }}>
            <Plus size={13} /> {isUrdu ? 'ایک اور بنائیں' : 'Create Another'}
          </button>
        </div>
      ) : (
        <>
          <div className="settings-section">
            <h3 style={{ marginBottom:18 }}>
              <Database size={14} style={{ display:'inline', marginRight:6 }} />
              {isUrdu ? 'کمپنی کی معلومات' : 'Company Information'}
            </h3>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div className="field-group">
                <label>{isUrdu ? 'کمپنی کا نام (انگریزی)' : 'Company Name (English)'} *</label>
                <input
                  type="text" className="input-field"
                  placeholder="Hassan & Dawood Enterprises"
                  value={companyName}
                  onChange={e => {
                    setCompanyName(e.target.value);
                    if (!fileName) setFileName(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '_'));
                  }}
                />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'کمپنی کا نام (اردو)' : 'Company Name (Urdu)'}</label>
                <input
                  type="text" className="input-field"
                  placeholder="حسن اینڈ داوؤد انٹرپرائزز"
                  value={companyNameUr}
                  onChange={e => setCompanyNameUr(e.target.value)}
                  dir="rtl"
                  style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}
                />
              </div>
              <div className="field-group">
                <label>{isUrdu ? 'فائل کا نام (.sqlite)' : 'File Name (.sqlite)'}</label>
                <input
                  type="text" className="input-field"
                  placeholder="MyCompany"
                  value={fileName}
                  onChange={e => setFileName(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '_'))}
                />
                <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>
                  {isUrdu ? 'صرف حروف، اعداد، انڈر اسکور' : 'Letters, numbers, underscores only'}
                </span>
              </div>
            </div>

            {result?.error && (
              <div className="error-banner" style={{ marginTop:14, display:'flex', alignItems:'center', gap:8 }}>
                <AlertCircle size={15} /> {result.error}
              </div>
            )}

            <div style={{ marginTop:24 }}>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !companyName.trim()}>
                <Database size={14} />
                {creating ? '…' : (isUrdu ? 'ڈیٹا بیس بنائیں' : 'Create Database')}
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3 style={{ marginBottom:12 }}>{isUrdu ? 'کیا شامل ہوگا' : 'What gets created'}</h3>
            {[
              isUrdu ? 'تمام معیاری اکاؤنٹ گروپس (سرمایہ، واجبات، اثاثے، آمدنی، اخراجات)' : 'Standard account heads (Capital, Liabilities, Assets, Income, Expenses)',
              isUrdu ? 'تمام وصول نامہ اقسام (نقد وصولی، ادائیگی، جنرل ووچر، خرید، فروخت وغیرہ)' : 'All voucher types (Cash Receipt, Payment, Journal, Purchase, Sale, etc.)',
              isUrdu ? 'بنیادی ذیلی گروپس اور کیش اکاؤنٹ' : 'Standard sub-accounts and a default Cash account',
              isUrdu ? 'کمپنی انفارمیشن ریکارڈ' : 'Company info record',
            ].map((item, i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                <CheckCircle size={13} style={{ color:'var(--emerald)', flexShrink:0, marginTop:2 }} />
                <span style={{ fontSize:13, color:'var(--text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
