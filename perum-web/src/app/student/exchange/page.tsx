'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from './page.module.css';
import { MarketData, ExchangePortfolio } from '@/types';
import { CoinIcon } from '@/components/ui/CoinIcon';
import Modal from '@/components/ui/Modal';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ScriptableContext
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

/* ════════════════════════════════════════
   Types
   ════════════════════════════════════════ */
interface SubjectHistory {
    id: number;
    average_score: number;
    index_change: number;
    created_at: string;
}

interface HistoryResponse {
    subject_id: number;
    history: SubjectHistory[];
}

interface ExchangeLog {
    id: number;
    action: string;
    amount: number;
    price: number | null;
    created_at: string;
    subject: {
        id: number;
        name: string;
        category: string;
    };
}

/* ════════════════════════════════════════
   Subject Icons Helper
   ════════════════════════════════════════ */
const getSubjectIcon = (name: string) => {
    const colors: Record<string, string> = {
        'Математика': 'linear-gradient(135deg, #3b82f6, #06b6d4)',
        'Алгебра': 'linear-gradient(135deg, #3b82f6, #06b6d4)',
        'Русский язык': 'linear-gradient(135deg, #ef4444, #f97316)',
        'Литература': 'linear-gradient(135deg, #ec4899, #f43f5e)',
        'Английский язык': 'linear-gradient(135deg, #10b981, #34d399)',
        'Физика': 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
        'Химия': 'linear-gradient(135deg, #f59e0b, #fbbf24)',
        'Биология': 'linear-gradient(135deg, #22c55e, #86efac)',
        'История': 'linear-gradient(135deg, #a855f7, #c084fc)',
        'Обществознание': 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
        'География': 'linear-gradient(135deg, #14b8a6, #5eead4)',
        'Информатика': 'linear-gradient(135deg, #6366f1, #818cf8)',
        'ОБЖ': 'linear-gradient(135deg, #f97316, #fb923c)',
        'Физкультура': 'linear-gradient(135deg, #ef4444, #f87171)',
        'Музыка': 'linear-gradient(135deg, #d946ef, #f0abfc)',
        'ИЗО': 'linear-gradient(135deg, #f472b6, #fb7185)',
        'Технология': 'linear-gradient(135deg, #78716c, #a8a29e)',
    };
    return colors[name] || 'linear-gradient(135deg, #64748b, #94a3b8)';
};

/* ════════════════════════════════════════
   Modals
   ════════════════════════════════════════ */
function FaqMarketModal({ onClose }: { onClose: () => void }) {
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Как работает рынок?
                </span>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>🏦 Что такое биржа?</h4>
                    <p style={{ margin: 0 }}>Биржа — это место, где вы можете вкладывать заработанные ливки в предметы. Вы можете приумножить капитал или потерять часть вложенного в зависимости от успеваемости всех учеников.</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>📅 Окно торгов</h4>
                    <p style={{ margin: 0 }}>Биржа работает <strong>только по воскресеньям с 08:00 до 20:00 (МСК)</strong>. В остальное время вклады недоступны. Каждый сделанный вклад <strong>замораживается ровно на 7 дней</strong> — результат начисляется в следующее воскресенье.</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>📈 Рост и падение</h4>
                    <p style={{ margin: 0 }}>Каждый день рассчитывается <strong>Индекс предмета</strong> на основе средних оценок. Если ученики начинают учиться лучше — индекс растет, если хуже — падает. Ваши активные вклады изменяются пропорционально этому индексу.</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>💰 Ограничения</h4>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                        <li style={{ marginBottom: '4px' }}>Максимальная сумма вкладов за одно окно торгов: <strong>500 ливок</strong>.</li>
                        <li>Минимальный неснижаемый остаток на балансе: <strong>50 ливок</strong> (вы не можете делать вклад, если на счету останется меньше).</li>
                    </ul>
                </div>
            </div>
        </Modal>
    );
}

function FaqPortfolioModal({ onClose }: { onClose: () => void }) {
    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Как работает портфель?
                </span>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>💼 Что такое портфель?</h4>
                    <p style={{ margin: 0 }}>Мой портфель — это страница, где отображаются все ваши текущие и прошлые инвестиции, а также общая статистика прибыльности.</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>⏳ Активные вклады</h4>
                    <p style={{ margin: 0 }}>Это вклады, которые вы сделали. Они находятся в ожидании расчета и изменятся в стоимости после завершения торгового периода (недели).</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>✅ Завершенные вклады</h4>
                    <p style={{ margin: 0 }}>Это история ваших прошлых инвестиций. Здесь вы можете увидеть, оказались ли они прибыльными (+) или убыточными (-) после закрытия периода.</p>
                </div>
            </div>
        </Modal>
    );
}

/* ════════════════════════════════════════
   Main Component
   ════════════════════════════════════════ */
export default function ExchangePage() {
    const { user, refreshUser } = useAuth();
    const { showSuccess, showError } = useToast();

    /* ── State ── */
    const [activeTab, setActiveTab] = useState<'market' | 'portfolio' | 'history'>('market');
    const [marketData, setMarketData] = useState<MarketData | null>(null);
    const [portfolio, setPortfolio] = useState<ExchangePortfolio | null>(null);
    const [loading, setLoading] = useState(true);

    // Logs State
    const [logs, setLogs] = useState<ExchangeLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsLoaded, setLogsLoaded] = useState(false);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;
    const [portfolioPage, setPortfolioPage] = useState(1);
    const portfolioItemsPerPage = 10;

    // Chart State
    const [selectedSubject, setSelectedSubject] = useState<number | ''>('');
    const [subjectHistory, setSubjectHistory] = useState<SubjectHistory[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [chartPeriod, setChartPeriod] = useState<'2w' | 'quarter' | 'half_year' | 'year'>('2w');

    // Invest Form
    const [investSubject, setInvestSubject] = useState<number | ''>('');
    const [investAmount, setInvestAmount] = useState<number | ''>('');
    const [isInvestModalOpen, setIsInvestModalOpen] = useState(false);

    // Modals
    const [showMarketFaq, setShowMarketFaq] = useState(false);
    const [showPortfolioFaq, setShowPortfolioFaq] = useState(false);

    /* ── Data Fetching ── */
    const loadAllData = useCallback(async () => {
        try {
            const [mdData, pfData] = await Promise.all([
                api.get<MarketData>('/exchange/market-data').catch(() => null),
                api.get<ExchangePortfolio>('/exchange/portfolio').catch(() => null)
            ]);
            setMarketData(mdData);
            setPortfolio(pfData);

            if (mdData && mdData.available_subjects?.length > 0 && selectedSubject === '') {
                const firstSubj = mdData.available_subjects[0].id;
                setSelectedSubject(firstSubj);
                setInvestSubject(firstSubj);
            }
        } catch {
            showError('Ошибка загрузки данных биржи');
        } finally {
            setLoading(false);
        }
    }, [showError, selectedSubject]);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    const loadHistory = useCallback(async (subjId: number, period: '2w' | 'quarter' | 'half_year' | 'year' = '2w') => {
        setHistoryLoading(true);
        try {
            const periodParam = period === '2w' ? '?limit=14' : `?period=${period}`;
            const res = await api.get<HistoryResponse>(`/exchange/history/${subjId}${periodParam}`);
            setSubjectHistory(res.history || []);
        } catch {
            showError('Не удалось загрузить историю предмета');
        } finally {
            setHistoryLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        if (selectedSubject) {
            loadHistory(selectedSubject as number, chartPeriod);
        }
    }, [selectedSubject, chartPeriod, loadHistory]);

    const loadLogs = useCallback(async () => {
        setLogsLoading(true);
        try {
            const res = await api.get<ExchangeLog[]>('/exchange/logs?limit=50');
            setLogs(res || []);
        } catch {
            showError('Не удалось загрузить историю торгов');
        } finally {
            setLogsLoading(false);
            setLogsLoaded(true);
        }
    }, [showError]);

    useEffect(() => {
        if (activeTab === 'history' && !logsLoaded && !logsLoading) {
            loadLogs();
        }
    }, [activeTab, logsLoaded, logsLoading, loadLogs]);

    /* ── Chart Data Preparation ── */
    const formatDay = (dateStr: string) => {
        const d = new Date(dateStr);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}.${mm}`;
    };

    const chartData = {
        labels: subjectHistory.map(h => formatDay(h.created_at)),
        datasets: [{
            label: 'Индекс',
            data: subjectHistory.map(h => h.average_score),
            borderColor: '#3b82f6',
            backgroundColor: (context: ScriptableContext<'line'>) => {
                const ctx = context.chart.ctx;
                const gradient = ctx.createLinearGradient(0, 0, 0, 250);
                gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
                gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
                return gradient;
            },
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#3b82f6',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 8,
            pointHitRadius: 20,
            borderWidth: 3
        }]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                titleColor: '#e2e8f0',
                bodyColor: '#e2e8f0',
                padding: 12,
                cornerRadius: 8,
                displayColors: false
            }
        },
        scales: {
            y: {
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false
                },
                min: 2.0,
                max: 5.0,
                ticks: { color: '#9898a6', font: { size: 11 } }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#9898a6', font: { size: 11 }, maxRotation: 45, minRotation: 45 }
            }
        }
    };

    /* ── Actions ── */
    const handleInvest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!investSubject || !investAmount || investAmount <= 0) {
            showError('Заполните поле суммы и выберите предмет');
            return;
        }

        if (investAmount > 500) {
            showError('Максимальная сумма вклада за неделю - 500 ливок');
            return;
        }

        // Блокировка повторного вклада в тот же предмет
        if (investedSubjects.has(investSubject)) {
            showError('Вы уже вложились в этот предмет. Выберите другой предмет.');
            return;
        }

        try {
            await api.post('/exchange/invest', { subject_id: investSubject, amount: investAmount });
            showSuccess(`Вклад ${investAmount} ливок размещен!`);
            setInvestAmount('');
            loadAllData();
            setLogsLoaded(false); // Invalidate logs so they refetch next time History tab is opened
            refreshUser();
            setActiveTab('portfolio');
            setIsInvestModalOpen(false);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка инвестирования';
            showError(message);
        }
    };

    /* ── Render Helpers ── */
    const renderChangeArrow = (change: number) => {
        if (change > 0) return '▲';
        if (change < 0) return '▼';
        return '─';
    };

    const getChangeClass = (change: number) => {
        return change > 0 ? styles.positive : change < 0 ? styles.negative : styles.neutral;
    };

    const isWindowOpen = marketData?.trading_window?.is_active || false;

    // Предметы, в которые уже есть активный вклад в этой сессии
    const investedSubjects = new Set(
        (portfolio?.active_investments || [])
            .map((inv: { subject_id?: number }) => inv.subject_id)
            .filter((id): id is number => id !== undefined)
    );

    // Считаем изменение текущего предмета по отношению к вчера (предпоследней записи в истории)
    const currentSubjectIndex = subjectHistory.length > 0 ? subjectHistory[subjectHistory.length - 1].average_score : 0;
    const previousSubjectIndex = subjectHistory.length > 1 ? subjectHistory[subjectHistory.length - 2].average_score : currentSubjectIndex;
    const currentSubjectChange = previousSubjectIndex > 0 ? ((currentSubjectIndex / previousSubjectIndex) - 1) * 100 : 0;

    // Название текущего выбранного предмета
    const selectedSubjectName = marketData?.available_subjects?.find(
        (s: { id: number; name: string }) => s.id === selectedSubject
    )?.name || '';

    /* ── Views ── */
    const renderMarket = () => (
        <div className={`${styles.dashboardGrid} ${styles.fadeIn}`}>
            {/* Left: Chart & Subjects */}
            <div className={styles.mainCol}>
                <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                        <div className={styles.chartControls}>
                            <span className={styles.chartSubjectLabel}>{selectedSubjectName}</span>
                        </div>
                        <div className={styles.indexSummary}>
                            <div className={styles.indexLabel}>Индекс предмета</div>
                            <div className={styles.indexValue}>{currentSubjectIndex.toFixed(2)}</div>
                            <div className={`${styles.indexChange} ${getChangeClass(currentSubjectChange)}`}>
                                {renderChangeArrow(currentSubjectChange)} {Math.abs(currentSubjectChange).toFixed(2)}%
                            </div>
                        </div>
                    </div>

                    {/* Period switcher */}
                    <div style={{ display: 'flex', gap: '6px', padding: '0 16px 12px', flexWrap: 'wrap' }}>
                        {(['2w', 'quarter', 'half_year', 'year'] as const).map(p => {
                            const labels: Record<string, string> = { '2w': '2 нед', quarter: 'Четверть', half_year: 'Полугодие', year: 'Год' };
                            return (
                                <button
                                    key={p}
                                    onClick={() => setChartPeriod(p)}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        border: chartPeriod === p ? 'none' : '1px solid var(--border-color)',
                                        background: chartPeriod === p ? 'var(--accent-primary)' : 'transparent',
                                        color: chartPeriod === p ? '#fff' : 'var(--text-secondary)',
                                        fontSize: '0.8rem',
                                        fontWeight: chartPeriod === p ? 600 : 400,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    {labels[p]}
                                </button>
                            );
                        })}
                    </div>

                    <div className={styles.chartContainer}>
                        {historyLoading ? (
                            <div className={styles.loading}><div className={styles.spinner} /></div>
                        ) : (
                            <Line data={chartData} options={chartOptions} />
                        )}
                    </div>
                </div>

                <div className={styles.subjectsCard}>
                    <h3 className={styles.subjectsTitle}>Рост / Падение предметов</h3>
                    <div className={styles.subjectsList}>
                        {marketData?.subject_averages?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(subj => (
                            <div key={subj.id} className={`${styles.subjectRow} ${(selectedSubject === (subj.subject?.id || subj.id)) ? styles.subjectRowActive : ''}`} onClick={() => { const id = subj.subject?.id || subj.id; setSelectedSubject(id); setInvestSubject(id); }}>
                                <div className={styles.subjectNameWrap}>
                                    <div className={styles.subjectIcon} style={{ 
                                        background: (subj.index_change || 0) > 0 ? 'var(--success)' : (subj.index_change || 0) < 0 ? 'var(--error)' : '#64748b' 
                                    }}>
                                        {(subj.index_change || 0) > 0 ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                                <polyline points="5 12 12 5 19 12"></polyline>
                                            </svg>
                                        ) : (subj.index_change || 0) < 0 ? (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                                <polyline points="19 12 12 19 5 12"></polyline>
                                            </svg>
                                        ) : (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"></circle>
                                            </svg>
                                        )}
                                    </div>
                                    <span className={styles.subjectName}>{subj.subject?.name || subj.name}</span>
                                </div>
                                <div className={styles.subjectValues}>
                                    <span className={styles.subjectGrade}>{subj.average_score?.toFixed(2)}</span>
                                    <span className={`${styles.subjectChangeDay} ${getChangeClass(subj.index_change || 0)}`}>
                                        {renderChangeArrow(subj.index_change || 0)}
                                    </span>
                                </div>
                                <div className={`${styles.subjectChangeWeek} ${getChangeClass(subj.index_change || 0)}`}>
                                    {(subj.index_change || 0) > 0 ? '+' : ''}{(subj.index_change || 0).toFixed(1)}%
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {marketData?.subject_averages && marketData.subject_averages.length > itemsPerPage && (
                        <div className={styles.marketPagination}>
                            <button
                                className={styles.pageBtn}
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            >
                                &lt;
                            </button>

                            {Array.from({ length: Math.ceil(marketData.subject_averages.length / itemsPerPage) }).map((_, idx) => (
                                <button
                                    key={`page-${idx + 1}`}
                                    className={`${styles.pageBtn} ${currentPage === idx + 1 ? styles.pageBtnActive : ''}`}
                                    onClick={() => setCurrentPage(idx + 1)}
                                >
                                    {idx + 1}
                                </button>
                            ))}

                            <button
                                className={styles.pageBtn}
                                disabled={currentPage === Math.ceil(marketData.subject_averages.length / itemsPerPage)}
                                onClick={() => setCurrentPage(prev => Math.min(Math.ceil((marketData.subject_averages?.length || 0) / itemsPerPage), prev + 1))}
                            >
                                &gt;
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Status & Form */}
            <div className={styles.sidebarCards}>
                <div className={styles.marketStatusCard}>
                    <div className={styles.statusInfo}>
                        <div className={styles.statusTitleWrap}>
                            <div className={`${styles.statusIndicator} ${isWindowOpen ? styles.open : styles.closed}`} />
                            <span className={styles.statusText}>
                                {isWindowOpen ? 'Торги открыты' : 'Торги закрыты'}
                            </span>
                        </div>
                        <div className={styles.tradingTime}>
                            {marketData?.trading_window?.opens_at && marketData?.trading_window?.closes_at ? (
                                (() => {
                                    const formatDT = (ds: string) => {
                                        try {
                                            const d = new Date(ds);
                                            const today = new Date();
                                            const isToday = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
                                            const tOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
                                            const dOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
                                            return isToday ? `Сегодня, ${d.toLocaleTimeString('ru-RU', tOpts)}` : `${d.toLocaleDateString('ru-RU', dOpts)}, ${d.toLocaleTimeString('ru-RU', tOpts)}`;
                                        } catch { return ds; }
                                    };
                                    return `${formatDT(marketData.trading_window.opens_at)} — ${formatDT(marketData.trading_window.closes_at)}`;
                                })()
                            ) : (
                                '—'
                            )}
                        </div>
                    </div>
                </div>

                <button
                    className={styles.mainInvestBtn}
                    onClick={() => setIsInvestModalOpen(true)}
                    disabled={!isWindowOpen}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="16"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    Сделать вклад {selectedSubjectName ? `в ${selectedSubjectName}` : ''}
                </button>
            </div>
        </div>
    );

    const renderPortfolio = () => (
        <div className={`${styles.portfolioGrid} ${styles.fadeIn}`}>
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <span className={styles.statTitle}>Общий баланс</span>
                    <span className={styles.statValue}>{portfolio?.total_points || 0}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statTitle}>В активных вкладах</span>
                    <span className={styles.statValue}>{portfolio?.invested_amount || 0}</span>
                </div>
                <div className={styles.statCard}>
                    <span className={styles.statTitle}>Прибыль за всё время</span>
                    <span className={`${styles.statValue} ${getChangeClass(portfolio?.total_profit_loss || 0)}`}>
                        {(portfolio?.total_profit_loss || 0) > 0 ? '+' : ''}{portfolio?.total_profit_loss || 0}
                    </span>
                </div>
            </div>

            <div className={styles.investmentsSection}>
                <h3 className={styles.investmentsSectionTitle}>Активные вклады</h3>
                {portfolio?.active_investments?.length ? (
                    <div className={styles.investmentsList}>
                        {portfolio.active_investments.map(inv => (
                            <div key={inv.id} className={`${styles.investmentItem} ${styles.neutral}`}>
                                <div className={styles.invInfo}>
                                    <span className={styles.invSubject}>{inv.subject?.name || 'Предмет'}</span>
                                    <div className={styles.invDetails}>
                                        <span className={styles.invDate}>{inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}</span>
                                        <span>Ожидает расчета</span>
                                    </div>
                                </div>
                                <div className={styles.invResult}>
                                    <span className={styles.invAmount} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {inv.amount} <CoinIcon id={`coinAct-${inv.id}`} className={styles.coinIcon} />
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>Нет активных вкладов</div>
                )}
            </div>

            <div className={styles.investmentsSection}>
                <h3 className={styles.investmentsSectionTitle}>Завершенные вклады</h3>
                {portfolio?.completed_investments?.length ? (
                    <>
                        <div className={styles.investmentsList}>
                            {portfolio.completed_investments.slice((portfolioPage - 1) * portfolioItemsPerPage, portfolioPage * portfolioItemsPerPage).map(inv => {
                                const pnl = (inv.result_amount || 0) - inv.amount;
                                return (
                                    <div key={inv.id} className={`${styles.investmentItem} ${getChangeClass(pnl)}`}>
                                        <div className={styles.invInfo}>
                                            <span className={styles.invSubject}>{inv.subject?.name || 'Предмет'}</span>
                                            <div className={styles.invDetails}>
                                                <span className={styles.invDate}>{inv.completed_at ? new Date(inv.completed_at).toLocaleDateString() : (inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—')}</span>
                                                <span>Индекс: {(inv.index_change || 0) > 0 ? '+' : ''}{(inv.index_change || 0).toFixed(1)}%</span>
                                            </div>
                                        </div>
                                        <div className={styles.invResult}>
                                            <span className={styles.invAmount} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {inv.result_amount || 0} <CoinIcon id={`coinRes-${inv.id}`} className={styles.coinIcon} />
                                            </span>
                                            <span className={`${styles.invPnl} ${getChangeClass(pnl)}`}>
                                                {pnl > 0 ? '+' : ''}{pnl}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {portfolio.completed_investments.length > portfolioItemsPerPage && (
                            <div className={styles.marketPagination} style={{ marginTop: '16px' }}>
                                <button
                                    className={styles.pageBtn}
                                    disabled={portfolioPage === 1}
                                    onClick={() => setPortfolioPage(prev => Math.max(1, prev - 1))}
                                >
                                    &lt;
                                </button>
                                {Array.from({ length: Math.ceil(portfolio.completed_investments.length / portfolioItemsPerPage) }).map((_, idx) => (
                                    <button
                                        key={`ppage-${idx + 1}`}
                                        className={`${styles.pageBtn} ${portfolioPage === idx + 1 ? styles.pageBtnActive : ''}`}
                                        onClick={() => setPortfolioPage(idx + 1)}
                                    >
                                        {idx + 1}
                                    </button>
                                ))}
                                <button
                                    className={styles.pageBtn}
                                    disabled={portfolioPage === Math.ceil(portfolio.completed_investments.length / portfolioItemsPerPage)}
                                    onClick={() => setPortfolioPage(prev => Math.min(Math.ceil((portfolio?.completed_investments?.length || 0) / portfolioItemsPerPage), prev + 1))}
                                >
                                    &gt;
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className={styles.emptyState}>История вкладов пуста</div>
                )}
            </div>
        </div>
    );

    const renderHistory = () => (
        <div className={`${styles.portfolioGrid} ${styles.fadeIn}`}>
            <div className={styles.investmentsSection}>
                <h3 className={styles.investmentsSectionTitle}>История торгов (Логи)</h3>
                {logsLoading ? (
                    <div className={styles.loading}><div className={styles.spinner} /></div>
                ) : logs.length > 0 ? (
                    <div className={styles.investmentsList}>
                        {logs.map(log => {
                            let actionText = '';
                            let sign = '';
                            let changeClass = styles.neutral;

                            if (log.action === 'invest') {
                                actionText = 'Размещение вклада';
                                sign = '-';
                                changeClass = styles.negative;
                            } else if (log.action === 'cancel') {
                                actionText = 'Отмена вклада';
                                sign = '+';
                                changeClass = styles.positive;
                            } else if (log.action === 'dividend') {
                                actionText = 'Закрытие периода';
                                sign = '+';
                                changeClass = styles.positive;
                            }

                            return (
                                <div key={log.id} className={`${styles.investmentItem} ${changeClass}`}>
                                    <div className={styles.invInfo}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div className={styles.subjectIcon} style={{ background: getSubjectIcon(log.subject.name), width: 24, height: 24 }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                            </div>
                                            <span className={styles.invSubject}>{actionText}</span>
                                        </div>
                                        <div className={styles.invDetails}>
                                            <span className={styles.invDate}>{new Date(log.created_at).toLocaleString('ru-RU')}</span>
                                            <span>Предмет: {log.subject.name}</span>
                                            {log.price !== null && <span>(Индекс: {log.price.toFixed(2)})</span>}
                                        </div>
                                    </div>
                                    <div className={styles.invResult}>
                                        <span className={`${styles.invAmount} ${changeClass}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            {sign}{log.amount} <CoinIcon id={`coinLog-${log.id}`} className={styles.coinIcon} />
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className={styles.emptyState}>История торгов пуста</div>
                )}
            </div>
        </div>
    );

    /* ── Initial Render ── */
    if (loading && !marketData) {
        return (
            <div className={styles.exchangePage}>
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <p>Загрузка биржи...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.exchangePage}>
            <div className={styles.headerControls}>
                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.viewBtn} ${activeTab === 'market' ? styles.viewBtnActive : ''}`}
                        onClick={() => setActiveTab('market')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
                        Рынок
                    </button>
                    <button
                        className={`${styles.viewBtn} ${activeTab === 'portfolio' ? styles.viewBtnActive : ''}`}
                        onClick={() => setActiveTab('portfolio')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        Мой портфель
                    </button>
                    <button
                        className={`${styles.viewBtn} ${activeTab === 'history' ? styles.viewBtnActive : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        История
                    </button>
                </div>

                <button
                    className={styles.faqButton}
                    onClick={() => activeTab === 'market' ? setShowMarketFaq(true) : setShowPortfolioFaq(true)}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Как работает {activeTab === 'market' ? 'рынок' : 'портфель'}?
                </button>
            </div>

            {activeTab === 'market' ? renderMarket() : activeTab === 'portfolio' ? renderPortfolio() : renderHistory()}

            {/* ======== Modals ======== */}
            {showMarketFaq && <FaqMarketModal onClose={() => setShowMarketFaq(false)} />}
            {showPortfolioFaq && <FaqPortfolioModal onClose={() => setShowPortfolioFaq(false)} />}
            {isInvestModalOpen && (
                <Modal isOpen={true} onClose={() => { setIsInvestModalOpen(false); setInvestAmount(''); }} title="Разместить вклад">
                    <div className={styles.investModalWrap}>
                        <form onSubmit={handleInvest}>
                            <div className={styles.formGroup}>
                                <label>Текущий индекс предмета</label>
                                <div className={styles.formHint} style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                    {investSubject ? (marketData?.subject_averages?.find(s => (s.subject?.id || s.id) === investSubject)?.average_score || 0).toFixed(2) : '—'}
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label>Предмет</label>
                                <div className={styles.formControl} style={{ background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center' }}>
                                    {selectedSubjectName}
                                    {investedSubjects.has(investSubject as number) && ' (уже вложено)'}
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label>Сумма вклада (Макс: 500)</label>
                                <input
                                    type="number"
                                    className={styles.formControl}
                                    min="1"
                                    max="500"
                                    placeholder="До 500 ливок"
                                    value={investAmount}
                                    onChange={(e) => setInvestAmount(parseInt(e.target.value) || '')}
                                    disabled={!isWindowOpen || investedSubjects.has(investSubject as number)}
                                />
                                <div className={styles.formHint}>Доступно: {user?.balance || 0} ливок</div>
                            </div>

                            {investSubject && investAmount && typeof investAmount === 'number' && (
                                <div className={styles.formGroup}>
                                    <label>Ожидаемый индекс после вклада</label>
                                    <div className={styles.formHint} style={{ fontSize: '1.1rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                        {((marketData?.subject_averages?.find(s => (s.subject?.id || s.id) === investSubject)?.average_score || 0) - (investAmount / 1000)).toFixed(2)}
                                        <span style={{ fontSize: '0.85rem', color: 'var(--error)', marginLeft: '8px' }}>(-{(investAmount / 1000).toFixed(2)})</span>
                                    </div>
                                    <div className={styles.formHint} style={{ marginTop: '4px' }}>Капа: 1000</div>
                                </div>
                            )}

                            <button
                                type="submit"
                                className={styles.btnSubmit}
                                disabled={!isWindowOpen || !investSubject || !investAmount || investAmount <= 0}
                            >
                                Сделать вклад
                            </button>
                        </form>
                    </div>
                </Modal>
            )}
        </div>
    );
}
