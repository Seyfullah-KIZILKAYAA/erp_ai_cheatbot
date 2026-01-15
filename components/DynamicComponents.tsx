/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'


import React from 'react';
import styles from './DynamicComponents.module.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Download, FileSpreadsheet, FileText, TrendingUp } from 'lucide-react';
import { toPng } from 'html-to-image';
import { useRef } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DynamicComponentProps {
    type: 'table' | 'chart' | 'stat' | 'trend';
    data: any;
}

export default function DynamicWidget({ type, data }: DynamicComponentProps) {
    const chartRef = useRef<HTMLDivElement>(null);

    if (!data) return null;

    const downloadTableAsCSV = () => {
        if (!Array.isArray(data) || data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(h => {
                const val = row[h];
                // Handle special cases and escaping
                const formatted = type === 'table' ? formatCell(val) : val;
                return `"${String(formatted).replace(/"/g, '""')}"`;
            }).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'tablo_verisi.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const downloadTableAsExcel = () => {
        if (!Array.isArray(data) || data.length === 0) return;

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        XLSX.writeFile(workbook, "tablo_verisi.xlsx");
    };

    const downloadTableAsPDF = () => {
        if (!Array.isArray(data) || data.length === 0) return;

        const doc = new jsPDF();
        const headers = Object.keys(data[0]);
        const body = data.map(row => headers.map(h => formatCell(row[h])));

        doc.text("Tablo Verisi", 14, 15);
        autoTable(doc, {
            head: [headers],
            body: body,
            startY: 20
        });

        doc.save("tablo_verisi.pdf");
    };

    const downloadChartAsImage = async () => {
        if (chartRef.current) {
            try {
                const dataUrl = await toPng(chartRef.current, { cacheBust: true, backgroundColor: '#1f2937' });
                const link = document.createElement('a');
                link.download = 'grafik.png';
                link.href = dataUrl;
                link.click();
            } catch (err) {
                console.error('Chart download error:', err);
            }
        }
    };

    // --- STAT CARD ---
    if (type === 'stat') {
        const value = typeof data.count === 'number' ? data.count : Object.values(data)[0];
        return (
            <div className={styles.dynamicWidget}>
                <div className={styles.statCard}>
                    <div className={styles.statValue}>{value}</div>
                    <div className={styles.statLabel}>Toplam Kayıt</div>
                </div>
            </div>
        );
    }

    // --- TABLE ---
    if (type === 'table') {
        if (!Array.isArray(data) || data.length === 0) return null;

        const headers = Object.keys(data[0]);

        return (
            <div className={styles.dynamicWidget}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '8px' }}>
                    <button onClick={downloadTableAsCSV} className={styles.downloadButton} title="CSV İndir">
                        <Download size={16} /> <span>CSV</span>
                    </button>
                    <button onClick={downloadTableAsExcel} className={styles.downloadButton} title="Excel İndir">
                        <FileSpreadsheet size={16} /> <span>Excel</span>
                    </button>
                    <button onClick={downloadTableAsPDF} className={styles.downloadButton} title="PDF İndir">
                        <FileText size={16} /> <span>PDF</span>
                    </button>
                </div>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                {headers.map(h => (
                                    <th key={h}>{formatHeader(h)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((row, i) => (
                                <tr key={i}>
                                    {headers.map(h => (
                                        <td key={`${i}-${h}`}>
                                            {formatCell(row[h])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // --- CHART / TREND ---
    if (type === 'chart' || type === 'trend') {
        if (!Array.isArray(data) || data.length === 0) return null;

        const keys = Object.keys(data[0]);
        let xKey = keys.find(k => k.includes('name') || k.includes('ad') || k.includes('date') || k.includes('tarih')) || keys[0];
        let dataKey = keys.find(k => typeof data[0][k] === 'number' && k !== 'id') || keys[1];

        // Forecasting indicator
        const isTrend = type === 'trend';

        return (
            <div className={styles.dynamicWidget}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div className={styles.chartTitle}>
                        {isTrend && <TrendingUp size={16} style={{ marginRight: '8px', color: '#3b82f6' }} />}
                        <span>{isTrend ? 'Tahmin Analizi' : 'Veri Grafiği'}</span>
                    </div>
                    <button onClick={downloadChartAsImage} className={styles.downloadButton} title="Grafiği İndir">
                        <Download size={16} /> <span>İndir</span>
                    </button>
                </div>
                <div className={styles.chartContainer} ref={chartRef}>
                    <ResponsiveContainer width="100%" height="100%">
                        {isTrend ? (
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey={xKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend />
                                <Line type="monotone" dataKey={dataKey} stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} name={formatHeader(dataKey)} />
                                {keys.includes('forecast') && (
                                    <Line type="monotone" dataKey="forecast" stroke="#adfa1d" strokeDasharray="5 5" strokeWidth={2} name="Tahmin" />
                                )}
                            </LineChart>
                        ) : (
                            <BarChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey={xKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend />
                                <Bar dataKey={dataKey} fill="#adfa1d" radius={[4, 4, 0, 0]} name={formatHeader(dataKey)} />
                            </BarChart>
                        )}
                    </ResponsiveContainer>
                </div>
            </div>
        );
    }

    return null;
}

// Yardımcılar
function formatHeader(key: string) {
    if (!key) return '';
    // camelCase -> Title Case (örn: "stockQuantity" -> "Stock Quantity")
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function formatCell(value: any) {
    if (value === null || value === undefined) return '-';
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
        return value[1]; // Odoo [id, name] format
    }
    if (typeof value === 'boolean') return value ? '✅' : '❌';
    if (value instanceof Date) return value.toLocaleDateString('tr-TR');
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(value).toLocaleDateString('tr-TR');
    }
    return value;
}
