'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function TeacherError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '2rem',
            textAlign: 'center',
        }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Ошибка загрузки страницы</h2>
            <p style={{ color: '#888', marginBottom: '1.5rem', maxWidth: 480 }}>
                Попробуйте перезагрузить страницу. Если проблема сохраняется — сообщите администратору.
            </p>
            <button
                onClick={() => reset()}
                style={{
                    padding: '10px 22px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#6366f1',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '1rem',
                }}
            >
                Повторить
            </button>
        </div>
    );
}
