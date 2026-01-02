/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'


import React from 'react';
import styles from './DynamicComponents.module.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DynamicComponentProps {
    type: 'table' | 'chart' | 'stat';
    data: any;
}

export default function DynamicWidget({ type, data }: DynamicComponentProps) {
    if (!data) return null;

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

    // --- CHART ---
    if (type === 'chart') {
        if (!Array.isArray(data) || data.length === 0) return null;

        // X ekseni için uygun bir aday bul (tarih veya isim)
        const keys = Object.keys(data[0]);
        let xKey = keys.find(k => k.includes('name') || k.includes('ad') || k.includes('date') || k.includes('tarih')) || keys[0];

        // Y ekseni için sayısal değeri bul
        let dataKey = keys.find(k => typeof data[0][k] === 'number' && k !== 'id') || keys[1];

        return (
            <div className={styles.dynamicWidget}>
                <div className={styles.chartContainer}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey={xKey} stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend />
                            <Bar dataKey={dataKey} fill="#adfa1d" radius={[4, 4, 0, 0]} name={formatHeader(dataKey)} />
                        </BarChart>
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
    if (typeof value === 'boolean') return value ? '✅' : '❌';
    if (value instanceof Date) return value.toLocaleDateString('tr-TR');
    if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(value).toLocaleDateString('tr-TR');
    }
    return value;
}
