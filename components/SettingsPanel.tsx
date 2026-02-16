'use client'

import { X, Sun, Moon, LayoutDashboard, Zap, Database, Upload, ChevronRight } from 'lucide-react'
import { AppSettings } from '@/lib/types/settings'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    onClose: () => void;
}

export default function SettingsPanel({ settings, onSettingsChange, onClose }: SettingsPanelProps) {

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
                            <Database size={16} />
                            <span>Veri Islemleri</span>
                        </div>

                        <div className={styles.settingItem}>
                            <div className={styles.settingInfo}>
                                <span className={styles.settingLabel}>Yazma Islevi</span>
                                <span className={styles.settingDesc}>Odoo&apos;da veri olusturma/guncelleme izni ver (siparis onaylama, kayit ekleme vb.)</span>
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
                                <span>Dikkat: Yazma islevi aktif. Agent&apos;lar Odoo veritabaninda degisiklik yapabilir.</span>
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
