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
    if (val >= 1e9) return (val / 1e9).toFixed(1) + ' Milyar ₺'
    if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M ₺'
    if (val >= 1e3) return Math.round(val / 1e3).toLocaleString('tr-TR') + 'K ₺'
    return val.toFixed(0) + ' ₺'
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
            setReportError('Rapor üretilemedi: ' + err.message)
        } finally {
            setLoadingReport(null)
        }
    }

    const reportButtons = [
        { type: 'daily-report', label: 'Günlük Rapor', icon: FileText },
        { type: 'anomaly-report', label: 'Anomali Raporu', icon: AlertTriangle },
        { type: 'forecast-report', label: 'Tahmin Raporu', icon: TrendingUp },
    ]

    return (
        <div style={{
            minHeight: '100vh',
            background: '#0f172a',
            color: '#e2e8f0',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        }}>
            {/* HEADER */}
            <header style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderBottom: '1px solid #334155',
                padding: '16px 32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Link href="/" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#94a3b8',
                        textDecoration: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        background: '#1e293b',
                        transition: 'all 0.2s',
                        fontSize: '14px',
                    }}>
                        <ArrowLeft size={18} />
                        <span>Chat&apos;e Dön</span>
                    </Link>
                    <div>
                        <h1 style={{ fontSize: '22px', color: '#38bdf8', margin: 0 }}>
                            ERPO Intelligence Platform
                        </h1>
                        <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                            AI-Powered ERP Analitik Raporları
                        </div>
                    </div>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: connected === null ? '#f59e0b' : connected ? '#22c55e' : '#ef4444',
                }}>
                    {connected === null ? (
                        <><Loader2 size={16} className="animate-spin" /> Bağlanıyor...</>
                    ) : connected ? (
                        <><CheckCircle2 size={16} /> ERPO Bağlı</>
                    ) : (
                        <><XCircle size={16} /> Bağlantı Hatası</>
                    )}
                </div>
            </header>

            {/* CONTENT */}
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '28px 32px' }}>

                {/* KPI ROW */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '28px',
                }}>
                    {kpi ? (
                        <>
                            <KpiCard
                                icon={<DollarSign size={22} />}
                                label="Toplam Gelir"
                                value={formatMoney(kpi.total_revenue)}
                                color="#22c55e"
                            />
                            <KpiCard
                                icon={<ShoppingCart size={22} />}
                                label="Sipariş Sayısı"
                                value={kpi.total_orders?.toLocaleString('tr-TR') || '-'}
                                color="#3b82f6"
                            />
                            <KpiCard
                                icon={<Users size={22} />}
                                label="Aktif Müşteri"
                                value={kpi.active_customers?.toString() || '-'}
                                color="#8b5cf6"
                            />
                            <KpiCard
                                icon={<AlertTriangle size={22} />}
                                label="Anomali"
                                value={kpi.anomaly_count?.toString() || '0'}
                                color="#ef4444"
                            />
                            <KpiCard
                                icon={<Activity size={22} />}
                                label="Ort. Sipariş"
                                value={formatMoney(kpi.avg_order_value)}
                                color="#f59e0b"
                            />
                        </>
                    ) : connected === false ? (
                        <div style={{
                            gridColumn: '1 / -1',
                            textAlign: 'center',
                            padding: '24px',
                            color: '#94a3b8',
                            background: '#1e293b',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                        }}>
                            ERPO platformuna bağlanılamadı. Lütfen servisin çalıştığından emin olun.
                        </div>
                    ) : (
                        <div style={{
                            gridColumn: '1 / -1',
                            textAlign: 'center',
                            padding: '24px',
                            color: '#94a3b8',
                        }}>
                            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                            KPI verileri yükleniyor...
                        </div>
                    )}
                </div>

                {/* REPORT BUTTONS */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '24px',
                    flexWrap: 'wrap',
                }}>
                    {reportButtons.map(({ type, label, icon: Icon }) => (
                        <button
                            key={type}
                            onClick={() => generateReport(type)}
                            disabled={loadingReport !== null}
                            style={{
                                padding: '12px 24px',
                                border: `1px solid ${activeReport === type ? '#0ea5e9' : '#334155'}`,
                                background: activeReport === type ? '#0ea5e9' : '#1e293b',
                                color: activeReport === type ? 'white' : '#e2e8f0',
                                borderRadius: '8px',
                                cursor: loadingReport ? 'wait' : 'pointer',
                                fontSize: '15px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                opacity: loadingReport && loadingReport !== type ? 0.5 : 1,
                                transition: 'all 0.2s',
                            }}
                        >
                            {loadingReport === type ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <Icon size={18} />
                            )}
                            {label}
                        </button>
                    ))}
                </div>

                {/* REPORT AREA */}
                <div style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    padding: '36px',
                    minHeight: '400px',
                }}>
                    {loadingReport ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '300px',
                            gap: '16px',
                            color: '#94a3b8',
                        }}>
                            <Loader2 size={32} className="animate-spin" style={{ color: '#38bdf8' }} />
                            <span style={{ fontSize: '16px' }}>AI rapor üretiliyor... (5-15 saniye)</span>
                        </div>
                    ) : reportError ? (
                        <div style={{
                            background: '#450a0a',
                            border: '1px solid #dc2626',
                            borderRadius: '8px',
                            padding: '16px',
                            color: '#fca5a5',
                        }}>
                            {reportError}
                        </div>
                    ) : report ? (
                        <>
                            <div
                                className="erpo-report-content"
                                dangerouslySetInnerHTML={{ __html: markdownToHtml(report.content) }}
                            />
                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                marginTop: '28px',
                                paddingTop: '16px',
                                borderTop: '1px solid #334155',
                                color: '#64748b',
                                fontSize: '13px',
                            }}>
                                <span>Model: {report.model_used || '-'}</span>
                                <span>Token: {report.tokens_used || '-'}</span>
                                <span>Tarih: {new Date().toLocaleDateString('tr-TR')}</span>
                            </div>
                        </>
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '300px',
                            color: '#64748b',
                            fontSize: '17px',
                        }}>
                            Rapor oluşturmak için yukarıdaki butonlardan birini tıklayın
                        </div>
                    )}
                </div>
            </div>

            {/* REPORT CONTENT STYLES */}
            <style jsx global>{`
                .erpo-report-content h1 {
                    font-size: 24px;
                    color: #38bdf8;
                    margin-bottom: 20px;
                    padding-bottom: 10px;
                    border-bottom: 2px solid #334155;
                }
                .erpo-report-content h2 {
                    font-size: 20px;
                    color: #7dd3fc;
                    margin-top: 24px;
                    margin-bottom: 12px;
                }
                .erpo-report-content h3 {
                    font-size: 17px;
                    color: #93c5fd;
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                .erpo-report-content p {
                    line-height: 1.8;
                    margin-bottom: 12px;
                    color: #cbd5e1;
                    font-size: 15px;
                }
                .erpo-report-content ul {
                    margin-left: 24px;
                    margin-bottom: 12px;
                }
                .erpo-report-content li {
                    line-height: 1.8;
                    margin-bottom: 6px;
                    color: #cbd5e1;
                }
                .erpo-report-content strong {
                    color: #f1f5f9;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
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
        <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '10px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            transition: 'border-color 0.2s',
        }}>
            <div style={{ color, opacity: 0.8 }}>{icon}</div>
            <div style={{
                fontSize: '26px',
                fontWeight: 'bold',
                color: '#38bdf8',
            }}>
                {value}
            </div>
            <div style={{
                fontSize: '13px',
                color: '#94a3b8',
            }}>
                {label}
            </div>
        </div>
    )
}
