import { AnalyticsDashboardResponse, AnalyticsTopicsResponse, TopicStats } from '@/types';

interface ReportStudent {
    id: number;
    name: string;
    avg: number;
    twos: number;
    reason?: string;
}

interface ReportData {
    className: string;
    period: string;
    dashboard: AnalyticsDashboardResponse;
    topics: AnalyticsTopicsResponse;
    students: { students: ReportStudent[] };
}

type ExcelRow = Record<string, string | number | undefined>;

export function generateReportHTML(type: string, data: ReportData): string {
    const periodLabel = getPeriodLabel(data.period);
    const date = new Date().toLocaleDateString('ru-RU');

    let content = `
        <div class="report-header" style="text-align: center; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid rgba(56, 189, 248, 0.15);">
            <h2 class="report-title" style="margin: 0; font-size: 22px; color: #f4f4f5; font-weight: 700;">Отчёт по классу ${data.className}</h2>
            <p class="report-meta" style="color: #9898a6; margin: 6px 0 0; font-size: 13px;">${periodLabel} • Сгенерировано: ${date}</p>
            <p class="report-type" style="color: #38bdf8; margin: 6px 0 0; font-weight: 600; font-size: 14px;">Тип отчёта: ${getReportTypeName(type)}</p>
        </div>
    `;

    const kpi = data.dashboard.kpi || ({} as AnalyticsDashboardResponse['kpi']);
    content += `
        <div class="report-section" style="margin-bottom: 28px;">
            <h3 class="report-section-title" style="border-bottom: 1px solid rgba(56, 189, 248, 0.15); padding-bottom: 8px; margin-bottom: 16px; color: #38bdf8; font-size: 15px; font-weight: 600;">Общая статистика</h3>
            <div class="report-summary-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                <div class="report-summary-item" style="background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); padding: 16px; border-radius: 10px; text-align: center; border: 1px solid rgba(56, 189, 248, 0.12);">
                    <div class="report-summary-value" style="font-size: 26px; font-weight: 700; color: #0ea5e9;">${Number(kpi.avg_grade || 0).toFixed(2)}</div>
                    <div class="report-summary-label" style="color: #9898a6; font-size: 12px; margin-top: 4px;">Средний балл</div>
                </div>
                <div class="report-summary-item" style="background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); padding: 16px; border-radius: 10px; text-align: center; border: 1px solid rgba(56, 189, 248, 0.12);">
                    <div class="report-summary-value" style="font-size: 26px; font-weight: 700; color: #f4f4f5;">${kpi.total_grades || 0}</div>
                    <div class="report-summary-label" style="color: #9898a6; font-size: 12px; margin-top: 4px;">Всего оценок</div>
                </div>
                <div class="report-summary-item" style="background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); padding: 16px; border-radius: 10px; text-align: center; border: 1px solid rgba(56, 189, 248, 0.12);">
                    <div class="report-summary-value" style="font-size: 26px; font-weight: 700; color: #ef4444;">${kpi.bad_grades || 0}</div>
                    <div class="report-summary-label" style="color: #9898a6; font-size: 12px; margin-top: 4px;">Неуд. оценок</div>
                </div>
            </div>
        </div>
    `;

    if (type === 'summary') {
        const studentsList = [...(data.students.students || [])].sort((a, b) => b.avg - a.avg);
        const top3 = studentsList.slice(0, 3);
        const worst3 = [...studentsList].sort((a, b) => a.avg - b.avg).slice(0, 3);

        content += renderStudentList('Топ-3 лучших ученика', top3, '#10b981');
        content += renderStudentList('Ученики, требующие внимания', worst3, '#ef4444');
    }

    if (type === 'problems' || type === 'detailed') {
        const topics = data.topics.topics || [];
        if (topics.length > 0) {
            content += renderTopicsTable(topics);
        }
    }

    if (type === 'problems' || type === 'detailed') {
        const students = data.students.students || [];
        if (students.length > 0) {
            content += renderProblemStudentsTable(students, type === 'detailed' ? 'Полный список учеников' : 'Ученики, требующие внимания');
        }
    }

    return content;
}

export function getReportDataForExcel(type: string, data: ReportData): ExcelRow[] {
    const rows: ExcelRow[] = [];
    rows.push({ 'Категория': 'Отчёт', 'Значение': getReportTypeName(type) });
    rows.push({ 'Категория': 'Класс', 'Значение': data.className });
    rows.push({ 'Категория': 'Период', 'Значение': getPeriodLabel(data.period) });
    rows.push({});

    const kpi = data.dashboard.kpi || ({} as AnalyticsDashboardResponse['kpi']);
    rows.push({ 'Категория': 'Средний балл', 'Значение': Number(kpi.avg_grade || 0).toFixed(2) });
    rows.push({ 'Категория': 'Всего оценок', 'Значение': kpi.total_grades });
    rows.push({ 'Категория': 'Неуд. оценок', 'Значение': kpi.bad_grades });
    rows.push({});

    if (type === 'summary') {
        rows.push({ 'Категория': '--- ТОП 3 ЛУЧШИХ УЧЕНИКА ---', 'Значение': '' });
        const top3 = [...(data.students.students || [])].sort((a, b) => b.avg - a.avg).slice(0, 3);
        top3.forEach(s => rows.push({ 'Ученик': s.name, 'Средний балл': s.avg.toFixed(2), 'Двоек': s.twos }));

        rows.push({});
        rows.push({ 'Категория': '--- ТРЕБУЮТ ВНИМАНИЯ ---', 'Значение': '' });
        const worst3 = [...(data.students.students || [])].sort((a, b) => a.avg - b.avg).slice(0, 3);
        worst3.forEach(s => rows.push({ 'Ученик': s.name, 'Средний балл': s.avg.toFixed(2), 'Двоек': s.twos }));
    }

    if (type === 'problems' || type === 'detailed') {
        rows.push({});
        rows.push({ 'Категория': '--- ПРОБЛЕМНЫЕ ТЕМЫ ---', 'Значение': '' });
        const topics = data.topics.topics || [];
        topics.forEach(t => rows.push({ 'Тема': t.name, 'Средний балл': t.avg.toFixed(2), 'Низкие оценки': t.bad_ratio }));

        rows.push({});
        rows.push({ 'Категория': '--- ТРЕБУЮТ ВНИМАНИЯ ---', 'Значение': '' });
        const students = data.students.students || [];
        students.forEach(s => rows.push({ 'Ученик': s.name, 'Средний балл': s.avg.toFixed(2), 'Двоек': s.twos, 'Причина': s.reason || '' }));
    }

    return rows;
}

function getReportTypeName(type: string): string {
    const map: Record<string, string> = {
        'summary': 'Краткая сводка',
        'problems': 'Проблемные зоны',
        'detailed': 'Подробный отчёт'
    };
    return map[type] || 'Отчёт';
}

function getPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
        'current': 'Текущая четверть',
        'quarter-1': '1 четверть',
        'quarter-2': '2 четверть',
        'quarter-3': '3 четверть',
        'quarter-4': '4 четверть',
        'half-year-1': '1 полугодие',
        'half-year-2': '2 полугодие',
        'year': 'Весь год'
    };
    return labels[period] || 'Период';
}

function getGradeColor(grade: number): string {
    if (grade >= 4.0) return '#10b981';
    if (grade >= 3.0) return '#f59e0b';
    return '#ef4444';
}

function renderStudentList(title: string, students: ReportStudent[], highlightColor: string = '#f4f4f5') {
    if (!students.length) return '';
    return `
        <div class="report-section" style="margin-bottom: 24px;">
            <h4 style="color: #9898a6; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">${title}</h4>
            <div style="display:flex; flex-direction: column; gap: 8px;">
                ${students.map(s => `
                    <div style="background: rgba(15,23,42,0.4); padding: 12px; border-radius: 8px; display: flex; justify-content: space-between;">
                        <span style="color: #f4f4f5; font-size: 14px;">${s.name}</span>
                        <span style="color: ${highlightColor}; font-weight: 600;">${Number(s.avg).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderTopicsTable(topics: TopicStats[]) {
    return `
        <div class="report-section" style="margin-bottom: 28px;">
            <h3 class="report-section-title" style="border-bottom: 1px solid rgba(56, 189, 248, 0.15); padding-bottom: 8px; margin-bottom: 16px; color: #38bdf8; font-size: 15px; font-weight: 600;">Проблемные темы</h3>
            <table class="report-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: rgba(15, 23, 42, 0.6);">
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Тема</th>
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Средний балл</th>
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Низкие оценки</th>
                    </tr>
                </thead>
                <tbody>
                    ${topics.map(t => `
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); color: #f4f4f5; font-size: 14px;">${t.name}</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); font-weight: 700; color: ${getGradeColor(t.avg)}; font-size: 14px;">${Number(t.avg).toFixed(2)}</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); color: #9898a6; font-size: 14px;">${t.bad_ratio || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderProblemStudentsTable(students: ReportStudent[], title: string) {
    return `
        <div class="report-section" style="margin-bottom: 28px;">
            <h3 class="report-section-title" style="border-bottom: 1px solid rgba(56, 189, 248, 0.15); padding-bottom: 8px; margin-bottom: 16px; color: #38bdf8; font-size: 15px; font-weight: 600;">${title}</h3>
            <table class="report-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: rgba(15, 23, 42, 0.6);">
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Ученик</th>
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Средний балл</th>
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Двоек</th>
                        <th style="padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(56, 189, 248, 0.2); color: #9898a6; font-size: 12px; font-weight: 600; text-transform: uppercase;">Причина</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.map(s => `
                        <tr>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); color: #f4f4f5; font-size: 14px;">${s.name}</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); font-weight: 700; color: ${getGradeColor(s.avg)}; font-size: 14px;">${Number(s.avg).toFixed(2)}</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); color: #ef4444; font-weight: 600; font-size: 14px;">${s.twos || 0}</td>
                            <td style="padding: 10px 12px; border-bottom: 1px solid rgba(56, 189, 248, 0.08); color: #9898a6; font-size: 14px;">${s.reason || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}
