/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
    ArrowLeft,
    Activity,
    DollarSign,
    ShoppingCart,
    Users,
    AlertTriangle,
    FileText,
    TrendingUp,
    Loader2,
    CheckCircle2,
    XCircle,
} from 'lucide-react'
import styles from './analytics.module.css'

interface KpiData {
    total_revenue: number
    total_orders: number
    active_customers: number
    avg_order_value: number
    mom_growth_pct: number | null
    anomaly_count: number
}

interface ReportData {
    report_type: string
    content: string
    model_used: string
    tokens_used: number
}

function formatMoney(val: number | null | undefined): string {
    if (!val) return '-'
    if (val >= 1e9) return (val / 1e9).toFixed(1) + ' Milyar'
    if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M'
    if (val >= 1e3) return Math.round(val / 1e3).toLocaleString('tr-TR') + 'K'
    return val.toFixed(0) + ' TL'
}

function markdownToHtml(md: string): string {
    return md
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br/>')
}

export default function AnalyticsPage() {
    const [connected, setConnected] = useState<boolean | null>(null)
    const [kpi, setKpi] = useState<KpiData | null>(null)
    const [report, setReport] = useState<ReportData | null>(null)
    const [loadingReport, setLoadingReport] = useState<string | null>(null)
    const [reportError, setReportError] = useState<string | null>(null)
    const [activeReport, setActiveReport] = useState<string | null>(null)

    useEffect(() => {
        fetch('/api/erpo')
            .then(res => res.json())
            .then(data => {
                setConnected(data.connected)
                if (data.kpi) setKpi(data.kpi)
            })
            .catch(() => setConnected(false))
    }, [])

    const generateReport = async (type: string) => {
        setLoadingReport(type)
        setActiveReport(type)
        setReport(null)
        setReportError(null)

        try {
            const res = await fetch('/api/erpo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type }),
            })
            const data = await res.json()

            if (data.error) {
                setReportError(data.error)
            } else {
                setReport(data)
            }
        } catch (err: any) {
            setReportError('Rapor uretilemedi: ' + err.message)
        } finally {
            setLoadingReport(null)
        }
    }

    const reportButtons = [
        { type: 'daily-report', label: 'Gunluk Rapor', icon: FileText },
        { type: 'anomaly-report', label: 'Anomali Raporu', icon: AlertTriangle },
        { type: 'forecast-report', label: 'Tahmin Raporu', icon: TrendingUp },
    ]

    return (
        <div className={styles.page}>
            {/* HEADER */}
            <header className={styles.header}>
                <div className={styles.headerLeft}>
                    <Link href="/" className={styles.backButton}>
                        <ArrowLeft size={16} />
                        <span>Chat&apos;e Don</span>
                    </Link>
                    <div>
                        <h1 className={styles.headerTitle}>ERPO Intelligence Platform</h1>
                        <div className={styles.headerSubtitle}>AI-Powered ERP Analitik Raporlari</div>
                    </div>
                </div>
                <div className={styles.connectionStatus} style={{
                    color: connected === null ? 'var(--warning)' : connected ? 'var(--accent)' : 'var(--danger)',
                }}>
                    {connected === null ? (
                        <><Loader2 size={16} className="animate-spin" /> Baglanıyor...</>
                    ) : connected ? (
                        <><CheckCircle2 size={16} /> ERPO Bagli</>
                    ) : (
                        <><XCircle size={16} /> Baglanti Hatasi</>
                    )}
                </div>
            </header>

            {/* CONTENT */}
            <div className={styles.content}>

                {/* KPI ROW */}
                <div className={styles.kpiGrid}>
                    {kpi ? (
                        <>
                            <KpiCard icon={<DollarSign size={20} />} label="Toplam Gelir" value={formatMoney(kpi.total_revenue)} color="var(--accent)" />
                            <KpiCard icon={<ShoppingCart size={20} />} label="Siparis Sayisi" value={kpi.total_orders?.toLocaleString('tr-TR') || '-'} color="var(--primary)" />
                            <KpiCard icon={<Users size={20} />} label="Aktif Musteri" value={kpi.active_customers?.toString() || '-'} color="#8b5cf6" />
                            <KpiCard icon={<AlertTriangle size={20} />} label="Anomali" value={kpi.anomaly_count?.toString() || '0'} color="var(--danger)" />
                            <KpiCard icon={<Activity size={20} />} label="Ort. Siparis" value={formatMoney(kpi.avg_order_value)} color="var(--warning)" />
                        </>
                    ) : connected === false ? (
                        <div className={styles.placeholder}>
                            ERPO platformuna baglanamadi. Lutfen servisin calistigindan emin olun.
                        </div>
                    ) : (
                        <div className={styles.loading}>
                            <Loader2 size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                            KPI verileri yukleniyor...
                        </div>
                    )}
                </div>

                {/* REPORT BUTTONS */}
                <div className={styles.reportButtons}>
                    {reportButtons.map(({ type, label, icon: Icon }) => (
                        <button
                            key={type}
                            onClick={() => generateReport(type)}
                            disabled={loadingReport !== null}
                            className={`${styles.reportButton} ${activeReport === type ? styles.reportButtonActive : ''} ${loadingReport && loadingReport !== type ? styles.reportButtonDisabled : ''}`}
                        >
                            {loadingReport === type ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
                            {label}
                        </button>
                    ))}
                </div>

                {/* REPORT AREA */}
                <div className={styles.reportArea}>
                    {loadingReport ? (
                        <div className={styles.reportLoading}>
                            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)' }} />
                            <span>AI rapor uretiyor... (5-15 saniye)</span>
                        </div>
                    ) : reportError ? (
                        <div className={styles.reportError}>{reportError}</div>
                    ) : report ? (
                        <>
                            <div
                                className={styles.reportContent}
                                dangerouslySetInnerHTML={{ __html: markdownToHtml(report.content) }}
                            />
                            <div className={styles.reportMeta}>
                                <span>Model: {report.model_used || '-'}</span>
                                <span>Token: {report.tokens_used || '-'}</span>
                                <span>Tarih: {new Date().toLocaleDateString('tr-TR')}</span>
                            </div>
                        </>
                    ) : (
                        <div className={styles.reportEmpty}>
                            Rapor olusturmak icin yukardaki butonlardan birini tiklayin
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function KpiCard({ icon, label, value, color }: {
    icon: React.ReactNode
    label: string
    value: string
    color: string
}) {
    return (
        <div className={styles.kpiCard}>
            <div className={styles.kpiIcon} style={{ color }}>{icon}</div>
            <div className={styles.kpiValue}>{value}</div>
            <div className={styles.kpiLabel}>{label}</div>
        </div>
    )
}
