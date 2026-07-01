'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import styles from './DeliveryCodeModal.module.css';

interface DeliveryCodeModalProps {
    inventoryId: number;
    itemName: string;
    token: string;
    onClose: () => void;
    onCancelled: () => void;
}

export default function DeliveryCodeModal({ inventoryId, itemName, token, onClose, onCancelled }: DeliveryCodeModalProps) {
    const [code, setCode] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<Date | null>(null);
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancelling] = useState(false);
    if (cancelling) console.log('cancelling');

    useEffect(() => {
        let isMounted = true;

        const generateCode = async () => {
            try {
                const res = await fetch(`/api/market/inventory/${inventoryId}/delivery/code`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail || 'Ошибка при получении кода');
                }

                const data = await res.json();
                if (isMounted) {
                    setCode(data.code);
                    setExpiresAt(new Date(data.expires_at + 'Z')); // Ensure UTC
                }
            } catch {
                if (isMounted) {
                    setError('Не удалось загрузить код');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        generateCode();

        return () => { isMounted = false; };
    }, [inventoryId, token]);

    useEffect(() => {
        if (!expiresAt) return;

        const updateTimer = () => {
            const now = new Date();
            const diff = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
            setTimeLeft(diff);

            if (diff === 0) {
                // Time's up, automatically close or show message
                setError('Время действия кода истекло. Пожалуйста, запросите новый.');
                setCode(null);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [expiresAt]);

    const handleCancel = () => {
        onCancelled(); // or you can omit this if it should not trigger parent refetch
        onClose();
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };
    
    // Format code: "123456" -> "123 456"
    const formatCode = (c: string) => {
        if (c.length !== 6) return c;
        return `${c.slice(0, 3)} ${c.slice(3)}`;
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Получение товара">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '10px 0' }}>
                <p className={styles.modalSubtitle}>
                    Покажите этот код учителю для получения: <b>{itemName}</b>
                </p>

                {loading ? (
                    <div className={styles.loadingSpinner} />
                ) : error ? (
                    <>
                        <p style={{ color: '#e74c3c', fontWeight: 500 }}>{error}</p>
                        <button className={styles.closeBtn} onClick={onClose}>Отмена</button>
                    </>
                ) : code ? (
                    <>
                        <div className={styles.codeContainer} onClick={() => navigator.clipboard.writeText(code)} style={{ cursor: 'pointer' }} title="Копировать код">
                            <p className={styles.digitCode}>{formatCode(code)}</p>
                            <p className={`${styles.timer} ${timeLeft < 60 ? styles.warning : ''}`}>
                                Осталось времени: {formatTime(timeLeft)}
                            </p>
                        </div>
                        
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                            Отмена просто закроет это окно. 
                            Ваш товар останется в инвентаре
                        </p>

                        <button 
                            className={styles.cancelBtn} 
                            onClick={handleCancel}
                            disabled={cancelling}
                        >
                            {cancelling ? 'Отмена...' : 'Отмена'}
                        </button>
                    </>
                ) : null}
            </div>
        </Modal>
    );
}
