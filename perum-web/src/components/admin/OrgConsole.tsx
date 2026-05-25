'use client';

import SchoolManagement from '@/components/admin/SchoolManagement';

/**
 * Кабинет org_admin — управляющий слой над школами организации (как контрол-плейн
 * над организациями). Только школы + их администраторы; внутрь школы org_admin
 * не заходит. Отдельный экран, без внутришкольного сайдбара.
 */
export default function OrgConsole({ onLogout, orgName }: { onLogout: () => void; orgName?: string }) {
    return (
        <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    background: '#0f172a',
                    color: '#e2e8f0',
                }}
            >
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>ПЭРУМ · Организация</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                        {orgName ? `${orgName} — ` : ''}управление школами и их администраторами
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    style={{
                        background: '#1e293b',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                    }}
                >
                    Выход
                </button>
            </header>

            <main style={{ padding: '1.5rem', maxWidth: 1100, margin: '0 auto' }}>
                <SchoolManagement />
            </main>
        </div>
    );
}
