'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
    ClassInfo,
    Subject,
    AnalyticsDashboardResponse,
    AnalyticsTopicsResponse,
} from '@/types';
import AnalyticsFilters from '@/components/analytics/AnalyticsFilters';
import KPICards from '@/components/analytics/KPICards';
import dynamic from 'next/dynamic';
const DynamicsChart = dynamic(() => import('@/components/analytics/DynamicsChart'), { ssr: false });
import ProblemTopics from '@/components/analytics/ProblemTopics';
import AttentionStudents from '@/components/analytics/AttentionStudents';
import styles from './page.module.css';
import journalStyles from '../journal/page.module.css';
import { generateReportHTML, getReportDataForExcel } from '@/utils/reportGenerator';
import { exportToExcel } from '@/utils/exportUtils';

export default function TeacherAnalytics() {
    const { showError, showSuccess } = useToast();

    // Filters State
    const [selectedClassId, setSelectedClassId] = useState<number>(0);
    const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);
    const [selectedPeriod, setSelectedPeriod] = useState<string>('current');

    // Data State
    const [teacherClasses, setTeacherClasses] = useState<ClassInfo[]>([]);
    const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);

    // Tab State
    const [currentTab, setCurrentTab] = useState<'dashboard' | 'reports'>('dashboard');

    // Dashboard Data
    const [dashboardData, setDashboardData] = useState<AnalyticsDashboardResponse | null>(null);

    // Loaders
    const [loading, setLoading] = useState(true); // Initial load
    const [tabLoading, setTabLoading] = useState(false);

    // Report State
    const [reportType, setReportType] = useState<string>('summary');
    const [generatingReport, setGeneratingReport] = useState(false);
    const [reportGenerated, setReportGenerated] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [reportExcelData, setReportExcelData] = useState<any[] | null>(null);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);

    // Initial Load
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // Fetch classes
                // const classesRes = await api.get<{ classes: ClassInfo[] }>('/journal/teacher/subjects'); unused

                // The API returns classes with nested subjects probably, but let's stick to known structure from Journal
                // Wait, in Journal we used /journal/teacher/subjects and it returned { classes: [...] }
                // Let's assume the basic ClassInfo structure is correct.

                // Correction: In Journal we saw that we need to extract subjects from classes or fetch them separately.
                // In analytics.js: loadTeacherClasses -> /teacher/classes
                // loadTeacherSubjects -> /teacher/subjects

                // Let's try to match existing API calls from Journal if possible, or use the ones from analytics.js if they are different endpoints.
                // Since I am porting analytics.js, I should probably respect its endpoints if backend supports them.
                // analytics.js: GET /teacher/classes
                // analytics.js: GET /teacher/subjects

                // Let's check api.get('/teacher/classes') in previous steps or assume parity.
                // I'll stick to what analytics.js uses.

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = await api.get<{ classes: any[] }>('/journal/teacher/subjects').catch(() => ({ classes: [] }));

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const sortedClasses = (data.classes || []).sort((a: any, b: any) =>
                    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                );
                setTeacherClasses(sortedClasses);

                // Select first class if available
                if (sortedClasses && sortedClasses.length > 0) {
                    const savedClassId = sessionStorage.getItem('analytics_selected_class_id');
                    if (savedClassId && sortedClasses.find(c => c.id === Number(savedClassId))) {
                        setSelectedClassId(Number(savedClassId));
                    } else {
                        setSelectedClassId(sortedClasses[0].id);
                    }
                }
            } catch (err: unknown) {
                console.error(err);
                showError('Ошибка загрузки данных');
            } finally {
                setLoading(false);
            }
        };
        loadInitialData();
    }, [showError]);

    // Save class selection and update available subjects
    useEffect(() => {
        if (selectedClassId) {
            sessionStorage.setItem('analytics_selected_class_id', String(selectedClassId));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cls = teacherClasses.find(c => c.id === selectedClassId) as any;
            if (cls && cls.subjects) {
                setAvailableSubjects(cls.subjects);
                // If currently selected subject is not in the new class subjects, reset it
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (selectedSubjectId && !cls.subjects.find((s: any) => s.id === selectedSubjectId)) {
                    setSelectedSubjectId(0);
                }
            } else {
                setAvailableSubjects([]);
                if (selectedSubjectId) setSelectedSubjectId(0);
            }
        }
    }, [selectedClassId, teacherClasses, selectedSubjectId]);

    // Helpers to get dates
    const getPeriodDates = (period: string) => {
        const year = new Date().getFullYear();
        const now = new Date();
        const month = now.getMonth() + 1;

        const startYear = month <= 8 ? year - 1 : year;
        const endYear = startYear + 1;

        const getCurrentQuarter = () => {
            if (month >= 9 && month <= 10) return { start: `${startYear}-09-01`, end: `${startYear}-10-31` };
            if (month >= 11 && month <= 12) return { start: `${startYear}-11-01`, end: `${startYear}-12-31` };
            if (month >= 1 && month <= 3) return { start: `${endYear}-01-01`, end: `${endYear}-03-31` };
            return { start: `${endYear}-04-01`, end: `${endYear}-05-31` };
        };

        switch (period) {
            case 'current': return getCurrentQuarter();
            case 'quarter-1': return { start: `${startYear}-09-01`, end: `${startYear}-10-31` };
            case 'quarter-2': return { start: `${startYear}-11-01`, end: `${startYear}-12-31` };
            case 'quarter-3': return { start: `${endYear}-01-01`, end: `${endYear}-03-31` };
            case 'quarter-4': return { start: `${endYear}-04-01`, end: `${endYear}-05-31` };
            case 'half-year-1': return { start: `${startYear}-09-01`, end: `${startYear}-12-31` };
            case 'half-year-2': return { start: `${endYear}-01-01`, end: `${endYear}-05-31` };
            case 'year': return { start: `${startYear}-09-01`, end: `${endYear}-05-31` };
            default: return getCurrentQuarter();
        }
    };

    // Load Data based on Tab
    const loadTabData = useCallback(async () => {
        if (!selectedClassId) return;

        setTabLoading(true);
        try {
            const periodDates = getPeriodDates(selectedPeriod);
            const params = new URLSearchParams({
                class_id: String(selectedClassId),
                period: `${periodDates.start},${periodDates.end}`
            });
            if (selectedSubjectId) {
                params.append('subject_id', String(selectedSubjectId));
            }

            if (currentTab === 'dashboard') {
                const data = await api.get<AnalyticsDashboardResponse>(`/teacher/analytics/dashboard?${params}`);
                setDashboardData(data);
            }
        } catch (err: unknown) {
            console.error(err);
            // showError('Не удалось загрузить данные'); // Optional: silent fail or toast
        } finally {
            setTabLoading(false);
        }
    }, [selectedClassId, selectedSubjectId, selectedPeriod, currentTab]); // Remove showError from deps

    useEffect(() => {
        loadTabData();
    }, [loadTabData]);

    const handleGenerateReport = async () => {
        if (!selectedClassId) {
            showError('Выберите класс');
            return;
        }
        setGeneratingReport(true);
        try {
            const periodDates = getPeriodDates(selectedPeriod);
            const params = new URLSearchParams({
                class_id: String(selectedClassId),
                period: `${periodDates.start},${periodDates.end}`,
                report_type: reportType
            });
            if (selectedSubjectId) {
                params.append('subject_id', String(selectedSubjectId));
            }

            const [dash, tops, studs] = await Promise.all([
                api.get<AnalyticsDashboardResponse>(`/teacher/analytics/dashboard?${params}`),
                api.get<AnalyticsTopicsResponse>(`/teacher/analytics/topics?${params}`),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                api.get<{ students: any[] }>(`/teacher/analytics/students/problem?${params}`) // Using loose type for students list here
            ]);

            // Map students to expected type for report
            const reportStudents = { students: studs.students || [] };

            const className = teacherClasses.find(c => c.id === selectedClassId)?.name || 'Класс';
            const reportPayload = {
                className,
                period: selectedPeriod,
                dashboard: dash,
                topics: tops,
                students: reportStudents
            };

            const html = generateReportHTML(reportType, reportPayload);
            const excelPayload = getReportDataForExcel(reportType, reportPayload);

            if (reportRef.current) {
                reportRef.current.innerHTML = html;
                reportRef.current.classList.remove('hidden');
            }
            setReportExcelData(excelPayload);
            setReportGenerated(true);
            showSuccess('Отчёт сгенерирован');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка генерации отчёта';
            showError(message);
        } finally {
            setGeneratingReport(false);
        }
    };

    const handlePrintReport = () => {
        if (!reportGenerated || !reportRef.current) return;
        const printWindow = window.open('', '', 'width=800,height=600');
        if (printWindow && reportRef.current) {
            // Clone HTML and strip inline dark colors for print (white paper)
            const printHtml = reportRef.current.innerHTML
                .replace(/background:\s*#1[0-5][0-5][0-5][0-9a-f]{2}/gi, 'background: #f3f4f6')
                .replace(/color:\s*#f4f4f5/gi, 'color: #111')
                .replace(/color:\s*#9898a6/gi, 'color: #555')
                .replace(/color:\s*#38bdf8/gi, 'color: #0369a1')
                .replace(/color:\s*#0ea5e9/gi, 'color: #0284c7')
                .replace(/border[^:]*:\s*1px solid rgba\(56,\s*189,\s*248[^)]*\)/gi, 'border-bottom: 1px solid #e5e7eb')
                .replace(/border:\s*1px solid rgba\(56,\s*189,\s*248[^)]*\)/gi, 'border: 1px solid #e5e7eb');
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Отчёт</title>
                        <style>
                            body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 24px; background: #fff; color: #111; }
                            table { width: 100%; border-collapse: collapse; }
                            th, td { padding: 10px 12px; text-align: left; }
                            th { background: #f3f4f6; color: #555; border-bottom: 2px solid #e5e7eb; font-size: 12px; }
                            td { border-bottom: 1px solid #e5e7eb; color: #111; }
                            h2, h3 { color: #111; }
                        </style>
                    </head>
                    <body>
                        ${printHtml}
                        <script>window.print();<\/script>
                    </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    if (loading) return <div className="p-6"><SkeletonCard /></div>;

    return (
        <div className={journalStyles.journalPage}>
            <div className={journalStyles.tabsWrapper}>
                <div className={journalStyles.tabsHeader} style={{ gridTemplateColumns: 'repeat(2, 1fr)', maxWidth: '400px' }}>
                    <button
                        className={`${journalStyles.tabBtn} ${currentTab === 'dashboard' ? journalStyles.activeTab : ''}`}
                        onClick={() => setCurrentTab('dashboard')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="3" y1="9" x2="21" y2="9" />
                            <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                        <span className={journalStyles.desktopText}>Дашборд</span>
                        <span className={journalStyles.mobileText}>Дашборд</span>
                    </button>
                    <button
                        className={`${journalStyles.tabBtn} ${currentTab === 'reports' ? journalStyles.activeTab : ''}`}
                        onClick={() => setCurrentTab('reports')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span className={journalStyles.desktopText}>Отчёты</span>
                        <span className={journalStyles.mobileText}>Отчёты</span>
                    </button>
                </div>
            </div>

            <AnalyticsFilters
                classes={teacherClasses}
                subjects={availableSubjects}
                selectedClassId={selectedClassId}
                selectedSubjectId={selectedSubjectId}
                selectedPeriod={selectedPeriod}
                onClassChange={setSelectedClassId}
                onSubjectChange={setSelectedSubjectId}
                onPeriodChange={setSelectedPeriod}
            />

            <div className={styles.content}>
                {tabLoading ? (
                    <div className={styles.loading}>Загрузка данных...</div>
                ) : (
                    <>
                        {currentTab === 'dashboard' && dashboardData && (
                            <div className="tab-fade-in">
                                <KPICards stats={dashboardData.kpi} />

                                <div className={styles.chartSection}>
                                    <div className={styles.sectionTitle}>Динамика успеваемости</div>
                                    <DynamicsChart data={dashboardData.dynamics} avgGrade={dashboardData.kpi.avg_grade} />
                                </div>

                                <div className={styles.analyticsGrid}>
                                    <div className={styles.panel}>
                                        <div className={styles.sectionTitle}>Проблемные темы</div>
                                        <ProblemTopics topics={dashboardData.problem_topics} />
                                    </div>
                                    <div className={styles.panel}>
                                        <div className={styles.sectionTitle}>Требуют внимания</div>
                                        <AttentionStudents students={dashboardData.attention_students} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentTab === 'reports' && (
                            <div className={`tab-fade-in ${styles.reportsLayout}`}>
                                <div className={`${styles.panel} ${styles.reportSidebar}`}>
                                    <div className={styles.sectionTitle}>Настройки отчёта</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input type="radio" name="reportType" value="summary" checked={reportType === 'summary'} onChange={(e) => setReportType(e.target.value)} />
                                            <span>Краткая сводка</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input type="radio" name="reportType" value="problems" checked={reportType === 'problems'} onChange={(e) => setReportType(e.target.value)} />
                                            <span>Проблемные зоны</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                            <input type="radio" name="reportType" value="detailed" checked={reportType === 'detailed'} onChange={(e) => setReportType(e.target.value)} />
                                            <span>Подробный отчёт</span>
                                        </label>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
                                            <button
                                                className="btn btn-primary"
                                                style={{ justifyContent: 'center' }}
                                                onClick={handleGenerateReport}
                                                disabled={generatingReport}
                                            >
                                                {generatingReport ? 'Генерация...' : 'Сгенерировать'}
                                            </button>

                                            <button
                                                className={`btn btn-secondary ${!reportGenerated ? styles.btnDisabled : ''}`}
                                                style={{ justifyContent: 'center' }}
                                                onClick={handlePrintReport}
                                            >
                                                Печать
                                            </button>

                                            <button
                                                className={`btn btn-secondary ${!reportGenerated ? styles.btnDisabled : ''}`}
                                                style={{ justifyContent: 'center' }}
                                                onClick={() => reportGenerated && setShowDownloadModal(true)}
                                            >
                                                Скачать файлом
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className={`${styles.panel} ${styles.reportContent}`}>
                                    <div ref={reportRef} id="report-content">
                                        <div className={styles.emptyState}>
                                            Выберите параметры и нажмите &quot;Сгенерировать&quot;
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {showDownloadModal && (
                <div className={styles.modalOverlay} onClick={() => setShowDownloadModal(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>Выберите формат скачивания</h3>
                        </div>
                        <div className={styles.modalBody}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => { handlePrintReport(); setShowDownloadModal(false); }}
                            >
                                Печать в PDF
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={async () => { if (reportExcelData) await exportToExcel(reportExcelData, `Отчёт_${selectedPeriod}`); setShowDownloadModal(false); }}
                            >
                                Скачать Excel
                            </button>

                            <div style={{ marginTop: '16px' }}>
                                <div className={styles.faqBox}>
                                    <p style={{ margin: '0 0 8px 0' }}><b>PDF-файл</b> больше подходит, если вы собираетесь отправить его руководству/родителям/ученикам для ознакомления.</p>
                                    <p style={{ margin: 0 }}><b>Excel-файл</b> больше подходит для сведения данных в таблицы, а также если нужно что-то отредактировать.</p>
                                </div>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className="btn btn-secondary" onClick={() => setShowDownloadModal(false)}>Отмена</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
