/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import {
  Database, X, ChevronRight, CheckCircle2, Loader2,
  Zap, Table2, Plug
} from 'lucide-react'
import styles from './ConnectionWizard.module.css'
import { ConnectionType } from '@/lib/adapters/IDataSourceAdapter'

interface ConnectionWizardProps {
  onComplete: () => void;
  onClose?: () => void;
  showClose?: boolean;
}

interface SourceOption {
  type: ConnectionType;
  label: string;
  desc: string;
  icon: string;
  color: string;
  bgColor: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    type: 'postgresql',
    label: 'PostgreSQL',
    desc: 'Acik kaynakli iliskisel veritabani',
    icon: 'PG',
    color: '#336791',
    bgColor: 'rgba(51, 103, 145, 0.12)',
  },
  {
    type: 'mysql',
    label: 'MySQL',
    desc: 'Populer acik kaynakli veritabani',
    icon: 'My',
    color: '#00758F',
    bgColor: 'rgba(0, 117, 143, 0.12)',
  },
  {
    type: 'mssql',
    label: 'SQL Server',
    desc: 'Microsoft SQL Server',
    icon: 'MS',
    color: '#CC2927',
    bgColor: 'rgba(204, 41, 39, 0.12)',
  },
  {
    type: 'sqlite',
    label: 'SQLite',
    desc: 'Hafif dosya tabanli veritabani',
    icon: 'SL',
    color: '#0F80CC',
    bgColor: 'rgba(15, 128, 204, 0.12)',
  },
  {
    type: 'odoo',
    label: 'Odoo ERP',
    desc: 'Odoo XML-RPC baglantisi',
    icon: 'Od',
    color: '#875A7B',
    bgColor: 'rgba(135, 90, 123, 0.12)',
  },
];

const DEFAULT_PORTS: Record<ConnectionType, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
  odoo: 8069,
};

export default function ConnectionWizard({ onComplete, onClose, showClose = true }: ConnectionWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<ConnectionType | null>(null);

  // Form state
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [ssl, setSsl] = useState(false);
  const [filepath, setFilepath] = useState('');
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [label, setLabel] = useState('');

  // Test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Discovery state
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<any>(null);

  const handleSelectType = (type: ConnectionType) => {
    setSelectedType(type);
    setPort(DEFAULT_PORTS[type]);
    setLabel('');
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!selectedType) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/connection/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          host,
          port,
          database,
          username,
          password,
          protocol: selectedType === 'odoo' ? protocol : undefined,
          ssl,
          filepath: selectedType === 'sqlite' ? filepath : undefined,
        }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message, latencyMs: 0 });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndDiscover = async () => {
    if (!selectedType) return;
    setIsDiscovering(true);

    try {
      const res = await fetch('/api/connection/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          label: label || `${SOURCE_OPTIONS.find(s => s.type === selectedType)?.label} Baglanti`,
          host,
          port,
          database,
          username,
          password,
          protocol: selectedType === 'odoo' ? protocol : undefined,
          ssl,
          filepath: selectedType === 'sqlite' ? filepath : undefined,
          rememberCredentials,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDiscoveryResult(data);
        setStep(3);
      } else {
        setTestResult({ success: false, message: data.error || 'Baglanti kaydedilemedi.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleComplete = () => {
    onComplete();
  };

  const canProceedStep1 = selectedType !== null;
  const canProceedStep2 = testResult?.success === true;

  return (
    <div className={styles.overlay}>
      <div className={styles.wizard}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <Database size={20} />
            </div>
            <div>
              <div className={styles.headerTitle}>Veri Kaynagi Baglantisi</div>
              <div className={styles.headerSubtitle}>Veritabaniniza veya ERP sisteminize baglanin</div>
            </div>
          </div>
          {showClose && onClose && (
            <button onClick={onClose} className={styles.closeButton}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* STEPS */}
        <div className={styles.steps}>
          <div className={`${styles.step} ${step >= 1 ? (step > 1 ? styles.stepCompleted : styles.stepActive) : ''}`}>
            <span className={styles.stepNumber}>{step > 1 ? <CheckCircle2 size={14} /> : '1'}</span>
            <span>Kaynak Sec</span>
          </div>
          <div className={styles.stepDivider} />
          <div className={`${styles.step} ${step >= 2 ? (step > 2 ? styles.stepCompleted : styles.stepActive) : ''}`}>
            <span className={styles.stepNumber}>{step > 2 ? <CheckCircle2 size={14} /> : '2'}</span>
            <span>Baglan</span>
          </div>
          <div className={styles.stepDivider} />
          <div className={`${styles.step} ${step >= 3 ? styles.stepActive : ''}`}>
            <span className={styles.stepNumber}>3</span>
            <span>Kesfet</span>
          </div>
        </div>

        {/* CONTENT */}
        <div className={styles.content}>
          {/* STEP 1: Choose Source */}
          {step === 1 && (
            <div className={styles.sourceGrid}>
              {SOURCE_OPTIONS.map(src => (
                <div
                  key={src.type}
                  className={`${styles.sourceCard} ${selectedType === src.type ? styles.sourceCardActive : ''}`}
                  onClick={() => handleSelectType(src.type)}
                >
                  <div
                    className={styles.sourceIcon}
                    style={{ background: src.bgColor, color: src.color }}
                  >
                    {src.icon}
                  </div>
                  <div className={styles.sourceLabel}>{src.label}</div>
                  <div className={styles.sourceDesc}>{src.desc}</div>
                </div>
              ))}
            </div>
          )}

          {/* STEP 2: Connection Form */}
          {step === 2 && selectedType && (
            <div className={styles.form}>
              {/* Connection Label */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Baglanti Adi (Opsiyonel)</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder={`${SOURCE_OPTIONS.find(s => s.type === selectedType)?.label} Baglantim`}
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                />
              </div>

              {/* SQLite - just filepath */}
              {selectedType === 'sqlite' ? (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Veritabani Dosya Yolu</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="/path/to/database.db"
                    value={filepath}
                    onChange={e => setFilepath(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  {/* Host & Port */}
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>
                        {selectedType === 'odoo' ? 'Sunucu Adresi' : 'Host'}
                      </label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder="localhost"
                        value={host}
                        onChange={e => setHost(e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Port</label>
                      <input
                        type="number"
                        className={styles.formInput}
                        value={port}
                        onChange={e => setPort(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Database */}
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      {selectedType === 'odoo' ? 'Veritabani Adi' : 'Veritabani'}
                    </label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder={selectedType === 'odoo' ? 'odoo_demo' : 'my_database'}
                      value={database}
                      onChange={e => setDatabase(e.target.value)}
                    />
                  </div>

                  {/* Username & Password */}
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Kullanici Adi</label>
                      <input
                        type="text"
                        className={styles.formInput}
                        placeholder={selectedType === 'odoo' ? 'admin@admin.com' : 'postgres'}
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Sifre</label>
                      <input
                        type="password"
                        className={styles.formInput}
                        placeholder="********"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Odoo Protocol */}
                  {selectedType === 'odoo' && (
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Protokol</label>
                      <select
                        className={styles.formInput}
                        value={protocol}
                        onChange={e => setProtocol(e.target.value as 'http' | 'https')}
                      >
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                      </select>
                    </div>
                  )}

                  {/* SSL for non-Odoo */}
                  {selectedType !== 'odoo' && (
                    <div className={styles.checkboxRow}>
                      <input
                        type="checkbox"
                        id="ssl"
                        className={styles.checkbox}
                        checked={ssl}
                        onChange={e => setSsl(e.target.checked)}
                      />
                      <label htmlFor="ssl" className={styles.checkboxLabel}>SSL/TLS Baglanti Kullan</label>
                    </div>
                  )}
                </>
              )}

              {/* Remember Credentials */}
              <div className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  id="remember"
                  className={styles.checkbox}
                  checked={rememberCredentials}
                  onChange={e => setRememberCredentials(e.target.checked)}
                />
                <label htmlFor="remember" className={styles.checkboxLabel}>Giris bilgilerini kaydet</label>
              </div>

              {/* Test Button */}
              <button
                className={styles.btnTest}
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? <Loader2 size={16} className={styles.spinner} /> : <Zap size={16} />}
                {isTesting ? 'Test Ediliyor...' : 'Baglantiyi Test Et'}
              </button>

              {/* Test Result */}
              {testResult && (
                <div className={`${styles.testResult} ${testResult.success ? styles.testSuccess : styles.testError}`}>
                  {testResult.success ? <CheckCircle2 size={18} /> : <X size={18} />}
                  <span>{testResult.message}</span>
                  {testResult.latencyMs > 0 && (
                    <span className={styles.testLatency}>{testResult.latencyMs}ms</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Schema Discovery */}
          {step === 3 && discoveryResult && (
            <div className={styles.discoverySection}>
              <div className={styles.discoveryStats}>
                <div className={styles.statCard}>
                  <div className={styles.statValue}>{discoveryResult.tableCount}</div>
                  <div className={styles.statLabel}>Tablo Bulundu</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: 'var(--accent)' }}>
                    <CheckCircle2 size={32} />
                  </div>
                  <div className={styles.statLabel}>Baglanti Basarili</div>
                </div>
              </div>

              {discoveryResult.tables && discoveryResult.tables.length > 0 && (
                <div className={styles.tableList}>
                  {discoveryResult.tables.map((t: any, i: number) => (
                    <div key={i} className={styles.tableItem}>
                      <Table2 size={14} className={styles.tableItemIcon} />
                      <span className={styles.tableItemName}>{t.name}</span>
                      {t.displayName && t.displayName !== t.name && (
                        <span className={styles.tableItemDisplay}>{t.displayName}</span>
                      )}
                    </div>
                  ))}
                  {discoveryResult.tableCount > 20 && (
                    <div className={styles.tableItem} style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                      ... ve {discoveryResult.tableCount - 20} tablo daha
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Loading state for discovery */}
          {isDiscovering && (
            <div className={styles.loadingSection}>
              <div className={styles.spinner} />
              <div className={styles.loadingText}>Sema kesfediliyor, tablolar okunuyor...</div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {step > 1 && step < 3 && (
              <button className={styles.btnSecondary} onClick={() => setStep(step - 1)}>
                Geri
              </button>
            )}
          </div>

          {step === 1 && (
            <button
              className={styles.btnPrimary}
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              Devam Et <ChevronRight size={16} style={{ marginLeft: 4 }} />
            </button>
          )}

          {step === 2 && (
            <button
              className={styles.btnPrimary}
              disabled={!canProceedStep2 || isDiscovering}
              onClick={handleSaveAndDiscover}
            >
              {isDiscovering ? (
                <>
                  <Loader2 size={16} /> Kesfediliyor...
                </>
              ) : (
                <>
                  <Plug size={16} style={{ marginRight: 4 }} /> Baglan ve Kesfet
                </>
              )}
            </button>
          )}

          {step === 3 && (
            <button className={styles.btnPrimary} onClick={handleComplete}>
              Kurulumu Tamamla <CheckCircle2 size={16} style={{ marginLeft: 4 }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
