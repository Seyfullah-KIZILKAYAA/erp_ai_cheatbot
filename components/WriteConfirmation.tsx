'use client'

import React from 'react';
import styles from './WriteConfirmation.module.css';
import { WriteConfirmationData } from '@/lib/types/writeConfirmation';
import { CheckCircle2, XCircle, AlertTriangle, CircleDot } from 'lucide-react';

interface WriteConfirmationProps {
    data: WriteConfirmationData;
    onAction: (actionId: string, decision: 'confirm' | 'cancel') => void;
    disabled: boolean;
}

export default function WriteConfirmation({ data, onAction, disabled }: WriteConfirmationProps) {
    const { pendingAction } = data;
    const isMissingCheck = pendingAction.step === 'missing_check';
    const isResolved = !!pendingAction.resolved;

    return (
        <div className={styles.confirmationCard}>
            <div className={styles.cardHeader}>
                <span>{data.title}</span>
                <span className={`${styles.stepBadge} ${isMissingCheck ? styles.stepMissing : styles.stepConfirm}`}>
                    {isMissingCheck ? '⚠ Eksik Alan Kontrolu' : '✓ Onay Bekleniyor'}
                </span>
            </div>

            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Alan</th>
                            <th>Deger</th>
                            <th>Durum</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingAction.fields.map((field) => (
                            <tr key={field.field}>
                                <td>{field.label}</td>
                                <td>
                                    {field.value !== null && field.value !== undefined && field.value !== '' ? (
                                        <span className={styles.valueCell}>
                                            {typeof field.value === 'boolean'
                                                ? (field.value ? 'Evet' : 'Hayir')
                                                : String(field.value)}
                                        </span>
                                    ) : (
                                        <span className={styles.emptyValue}>-</span>
                                    )}
                                </td>
                                <td>
                                    {field.value !== null && field.value !== undefined && field.value !== '' ? (
                                        <span className={styles.statusPresent}>
                                            <CheckCircle2 size={14} /> Mevcut
                                        </span>
                                    ) : field.required ? (
                                        <span className={styles.statusRequired}>
                                            <XCircle size={14} /> Zorunlu - Eksik
                                        </span>
                                    ) : (
                                        <span className={styles.statusMissing}>
                                            <AlertTriangle size={14} /> Opsiyonel - Eksik
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={styles.actionButtons}>
                {isResolved ? (
                    <span className={`${styles.resolvedBadge} ${
                        pendingAction.resolved === 'confirmed' ? styles.resolvedConfirmed : styles.resolvedCancelled
                    }`}>
                        <CircleDot size={14} />
                        {pendingAction.resolved === 'confirmed' ? 'Onaylandi' : 'Iptal Edildi'}
                    </span>
                ) : (
                    <>
                        <button
                            className={styles.confirmButton}
                            onClick={() => onAction(pendingAction.actionId, 'confirm')}
                            disabled={disabled}
                        >
                            <CheckCircle2 size={16} />
                            {isMissingCheck ? 'Evet, Devam Et' : 'Evet, Kaydet'}
                        </button>
                        <button
                            className={styles.cancelButton}
                            onClick={() => onAction(pendingAction.actionId, 'cancel')}
                            disabled={disabled}
                        >
                            <XCircle size={16} />
                            {isMissingCheck ? 'Hayir, Bilgi Ekleyecegim' : 'Hayir, Iptal'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
