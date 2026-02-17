'use client'

import { useState, useEffect } from 'react'
import { X, Sun, Moon, LayoutDashboard, Zap, Database, Upload, ChevronRight, Plug, RefreshCw, Loader2, Unplug } from 'lucide-react'
import { AppSettings } from '@/lib/types/settings'
import styles from './SettingsPanel.module.css'

interface ConnectionInfo {
    configured: boolean;
    connected: boolean;
    type?: string;
    label?: string;
    host?: string;
    database?: string;
    tableCount?: number;
}

interface SettingsPanelProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
    onOpenConnectionWizard?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
    odoo: 'Odoo ERP',
    postgresql: 'PostgreSQL',
    mysql: 'MySQL',
    mssql: 'SQL Server',
    sqlite: 'SQLite',
};

export default function SettingsPanel({ settings, onSettingsChange, onClose, onOpenConnectionWizard }: SettingsPanelProps) {
    const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    useEffect(() => {
        fetch('/api/connection')
            .then(res => res.json())
            .then(data => setConnectionInfo(data))
            .catch(() => setConnectionInfo({ configured: false, connected: false }));
    }, []);

    const updateSetting = <K extends keyof AppSettings>(
        category: K,
        key: keyof AppSettings[K],
        value: AppSettings[K][keyof AppSettings[K]]
    ) => {
        const updated = {
            ...settings,
            [category]: {
                ...settings[category],
                [key]: value,
            }
        };
        onSettingsChange(updated);
    };

    const handleRefreshSchema = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/schema?action=refresh');
            const data = await res.json();
            if (data.success) {
                setConnectionInfo(prev => prev ? { ...prev, tableCount: data.tableCount } : prev);
            }
        } catch { /* ignore */ }
        finally { setIsRefreshing(false); }
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            await fetch('/api/connection', { method: 'DELETE' });
            setConnectionInfo({ configured: false, connected: false });
            onSettingsChange({
                ...settings,
                connection: { ...settings.connection, configured: false }
            });
        } catch { /* ignore */ }
        finally { setIsDisconnecting(false); }
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Ayarlar</h2>
                    <button onClick={onClose} className={styles.closeButton}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {/* BAGLANTI */}
                    <div className={styles.category}>
                        <div className={styles.categoryHeader}>
                            <Plug size={16} />
                            <span>Baglanti</span>
                        </div>

                        {connectionInfo?.connected ? (
                            <>
                                <div className={styles.settingItem}>
                                    <div className={styles.settingInfo}>
                                        <span className={styles.settingLabel}>
                                            {connectionInfo.label || TYPE_LABELS[connectionInfo.type || ''] || 'Bagli'}
                                        </span>
                                        <span className={styles.settingDesc}>
                                            {connectionInfo.type ? TYPE_LABELS[connectionInfo.type] : ''} — {connectionInfo.host || ''}/{connectionInfo.database || ''}
                                            {connectionInfo.tableCount ? ` (${connectionInfo.tableCount} tablo)` : ''}
                                        </span>
                                    </div>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                    {onOpenConnectionWizard && (
                                        <button className={styles.actionButton} onClick={() => { onClose(); onOpenConnectionWizard(); }}>
                                            <Database size={14} />
                                            Degistir
                                        </button>
                                    )}
                                    <button className={styles.actionButton} onClick={handleRefreshSchema} disabled={isRefreshing}>
                                        {isRefreshing ? <Loader2 size={14} className={styles.spinIcon} /> : <RefreshCw size={14} />}
                                        Semalari Yenile
                                    </button>
                                    <button className={`${styles.actionButton} ${styles.actionButtonDanger}`} onClick={handleDisconnect} disabled={isDisconnecting}>
                                        {isDisconnecting ? <Loader2 size={14} className={styles.spinIcon} /> : <Unplug size={14} />}
                                        Kes
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className={styles.settingItem}>
                                <div className={styles.settingInfo}>
                                    <span className={styles.settingLabel}>Bagli Degil</span>
                                    <span className={styles.settingDesc}>Veritabani veya ERP sisteminize baglanin</span>
                                </div>
                                {onOpenConnectionWizard && (
                                    <button className={styles.connectButton} onClick={() => { onClose(); onOpenConnectionWizard(); }}>
                                        <Plug size={14} />
                                        Baglan
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* GORUNUM */}
                    <div className={styles.category}>
                        <div className={styles.categoryHeader}>
                            <Sun size={16} />
                            <span>Gorunum</span>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Tema</span>
                                <span className={styles.settingDesc}>Arayuz renk temasini secin</span>
                            </div>
                            <div className={styles.themeToggle}>
                                <button
                                    className={`${styles.themeOption} ${settings.appearance.theme === 'dark' ? styles.themeActive : ''}`}
                                    onClick={() => updateSetting('appearance', 'theme', 'dark')}
                                >
                                    <Moon size={14} />
                                    <span>Karanlik</span>
                                </button>
                                <button
                                    className={`${styles.themeOption} ${settings.appearance.theme === 'light' ? styles.themeActive : ''}`}
                                    onClick={() => updateSetting('appearance', 'theme', 'light')}
                                >
                                    <Sun size={14} />
                                    <span>Aydinlik</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* DASHBOARD */}
                    <div className={styles.category}>
                        <div className={styles.categoryHeader}>
                            <LayoutDashboard size={16} />
                            <span>Dashboard</span>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Canli Durum Paneli</span>
                                <span className={styles.settingDesc}>Sag taraftaki KPI kartlarini goster/gizle</span>
                            </div>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={settings.dashboard.showLivePanel}
                                    onChange={(e) => updateSetting('dashboard', 'showLivePanel', e.target.checked)}
                                />
                                <span className={styles.toggleSlider} />
                            </label>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Gunluk Ozet Karti</span>
                                <span className={styles.settingDesc}>Dashboard&apos;da yapay zeka ozet kartini goster</span>
                            </div>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={settings.dashboard.showBriefingCard}
                                    onChange={(e) => updateSetting('dashboard', 'showBriefingCard', e.target.checked)}
                                />
                                <span className={styles.toggleSlider} />
                            </label>
                        </div>
                    </div>

                    {/* VERI ISLEMLERI */}
                    <div className={styles.category}>
                        <div className={styles.categoryHeader}>
                            <Zap size={16} />
                            <span>Veri Islemleri</span>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Yazma Islevi</span>
                                <span className={styles.settingDesc}>Veritabaninda veri olusturma/guncelleme izni ver</span>
                            </div>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={settings.dataOperations.writeEnabled}
                                    onChange={(e) => updateSetting('dataOperations', 'writeEnabled', e.target.checked)}
                                />
                                <span className={styles.toggleSlider} />
                            </label>
                        </div>

                        {settings.dataOperations.writeEnabled && (
                            <div className={styles.warningBox}>
                                <span>Dikkat: Yazma islevi aktif. Agent&apos;lar veritabaninda degisiklik yapabilir.</span>
                            </div>
                        )}
                    </div>

                    {/* DOSYA ISLEMLERI */}
                    <div className={styles.category}>
                        <div className={styles.categoryHeader}>
                            <Upload size={16} />
                            <span>Dosya Islemleri</span>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Dosya Yukleme</span>
                                <span className={styles.settingDesc}>Excel/CSV dosya yukleme ve analiz ozelligi</span>
                            </div>
                            <label className={styles.toggle}>
                                <input
                                    type="checkbox"
                                    checked={settings.fileOperations.uploadEnabled}
                                    onChange={(e) => updateSetting('fileOperations', 'uploadEnabled', e.target.checked)}
                                />
                                <span className={styles.toggleSlider} />
                            </label>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Maks. Dosya Boyutu</span>
                                <span className={styles.settingDesc}>Yuklenebilecek maksimum dosya boyutu</span>
                            </div>
                            <div className={styles.selectWrapper}>
                                <select
                                    className={styles.select}
                                    value={settings.fileOperations.maxFileSizeMB}
                                    onChange={(e) => updateSetting('fileOperations', 'maxFileSizeMB', Number(e.target.value))}
                                >
                                    <option value={5}>5 MB</option>
                                    <option value={10}>10 MB</option>
                                    <option value={25}>25 MB</option>
                                </select>
                                <ChevronRight size={14} className={styles.selectArrow} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <span className={styles.footerText}>Ayarlar otomatik kaydedilir</span>
                </div>
            </div>
        </div>
    );
}
