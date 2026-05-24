'use client';

import React, { useState } from 'react';
import styles from './DeliveryCodeWidget.module.css';
import ConfirmDeliveryModal from '../market/ConfirmDeliveryModal';

interface DeliveryCodeWidgetProps {
    token: string;
    onDeliverySuccess: () => void;
}

export default function DeliveryCodeWidget({ token, onDeliverySuccess }: DeliveryCodeWidgetProps) {
    interface VerifyData {
        code: string;
        student_name: string;
        item_name: string;
    }
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [verifyData, setVerifyData] = useState<VerifyData | null>(null);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const cleanCode = code.replace(/\s/g, '');
        if (cleanCode.length !== 6) {
            setError('Код должен состоять из 6 цифр');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/market/delivery/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code: cleanCode })
            });

            const data = await res.json();
            
            if (res.ok) {
                setVerifyData({ ...data, code: cleanCode });
            } else {
                setError(data.detail || 'Неверный или просроченный код');
            }
        } catch {
            setError('Ошибка сети');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmed = () => {
        setVerifyData(null);
        setCode('');
        onDeliverySuccess();
    };

    return (
        <div className={styles.widget}>
            <h3 className={styles.title}>Выдача товаров</h3>
            <p className={styles.subtitle}>Введите 6-значный код ученика</p>
            
            <form onSubmit={handleVerify} className={styles.form}>
                <input 
                    type="text" 
                    className={styles.input} 
                    placeholder="123456" 
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    disabled={loading}
                />
                <button type="submit" className={styles.btn} disabled={loading || code.length < 6}>
                    {loading ? '...' : 'Проверить'}
                </button>
            </form>

            {error && <p className={styles.error}>{error}</p>}

            {verifyData && (
                <ConfirmDeliveryModal 
                    code={verifyData.code}
                    studentName={verifyData.student_name}
                    itemName={verifyData.item_name}
                    token={token}
                    onClose={() => setVerifyData(null)}
                    onConfirmed={handleConfirmed}
                />
            )}
        </div>
    );
}
