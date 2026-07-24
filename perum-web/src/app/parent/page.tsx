'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/apiClient';
import type { DiaryResponse, FinalGrade, GradesResponse } from '@/types';
import type { components } from '@perum/api-schema/tenant';
import styles from './parent.module.css';

type ParentChildren = components['schemas']['ParentChildrenOut'];
type Child = components['schemas']['ParentChildOut'];
type Analytics = components['schemas']['GradesAnalyticsOut'];
type GradesSummary = components['schemas']['GradesSummaryOut'];
type ParentTransactions = components['schemas']['ParentTransactionsOut'];

type Tab = 'diary' | 'grades' | 'finals' | 'analytics';
type ChildData = {
    diary?: DiaryResponse;
    grades?: GradesResponse;
    finals?: { final_grades: (FinalGrade & { subject_name: string; period_name: string | null })[] };
    analytics?: Analytics;
    summary?: GradesSummary;
    transactions?: ParentTransactions;
};

const tabs: { id: Tab; label: string }[] = [
    { id: 'diary', label: 'Расписание и ДЗ' },
    { id: 'grades', label: 'Оценки' },
    { id: 'finals', label: 'Итоговые' },
    { id: 'analytics', label: 'Аналитика и баланс' },
];

const formatDate = (value: string | null | undefined) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('ru-RU') : '';

export default function ParentDashboard() {
    const { token } = useAuth();
    const [children, setChildren] = useState<Child[]>([]);
    const [selectedChild, setSelectedChild] = useState<number | null>(null);
    const [tab, setTab] = useState<Tab>('diary');
    const [weekOffset, setWeekOffset] = useState(0);
    const [data, setData] = useState<ChildData>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        if (!token) return;
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        api.get<ParentChildren>('/parent/children', controller.signal)
            .then(response => {
                setChildren(response.children);
                setSelectedChild(current => response.children.some(child => child.id === current) ? current : response.children[0]?.id ?? null);
            })
            .catch(reason => {
                if (reason instanceof Error && reason.name !== 'AbortError') setError(reason.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [token, retry]);

    useEffect(() => {
        if (!selectedChild || !token) return;
        const controller = new AbortController();
        const base = `/parent/children/${selectedChild}`;
        setData({});
        setLoading(true);
        setError(null);
        let request: Promise<ChildData>;
        if (tab === 'diary') request = api.get<DiaryResponse>(`${base}/diary?week_offset=${weekOffset}`, controller.signal).then(diary => ({ diary }));
        else if (tab === 'grades') request = api.get<GradesResponse>(`${base}/grades`, controller.signal).then(grades => ({ grades }));
        else if (tab === 'finals') request = api.get<NonNullable<ChildData['finals']>>(`${base}/grades/finals`, controller.signal).then(finals => ({ finals }));
        else request = Promise.all([
            api.get<Analytics>(`${base}/grades/analytics`, controller.signal),
            api.get<GradesSummary>(`${base}/grades/summary`, controller.signal),
            api.get<ParentTransactions>(`${base}/transactions`, controller.signal),
        ]).then(([analytics, summary, transactions]) => ({ analytics, summary, transactions }));
        request.then(setData).catch(reason => {
            if (reason instanceof Error && reason.name !== 'AbortError') setError(reason.message);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [selectedChild, tab, token, weekOffset, retry]);

    const child = children.find(item => item.id === selectedChild);
    if (loading && children.length === 0) return <div className={styles.state}>Загрузка кабинета...</div>;
    if (error && children.length === 0) return <div className={styles.state}>Не удалось загрузить кабинет: {error}<br /><button onClick={() => setRetry(value => value + 1)}>Повторить</button></div>;
    if (!children.length) return <div className={styles.state}><h2>Нет привязанных детей</h2><p>Обратитесь к администратору школы.</p></div>;

    return <main className={styles.page}>
        <header className={styles.header}>
            <div><span className={styles.eyebrow}>Учебный кабинет</span><h1>{child?.last_name} {child?.first_name}</h1><p>{child?.class_name || 'Класс не указан'}</p></div>
            {children.length > 1 && <select value={selectedChild ?? ''} onChange={event => { setSelectedChild(Number(event.target.value)); setWeekOffset(0); }}>
                {children.map(item => <option key={item.id} value={item.id}>{item.last_name} {item.first_name}</option>)}
            </select>}
        </header>
        <section className={styles.metrics}>
            <div><strong>{child?.average || '—'}</strong><span>Средний балл</span></div>
            <div><strong>{child?.total_grades || 0}</strong><span>Оценок</span></div>
            <div><strong>{child?.balance || 0}</strong><span>Баланс</span></div>
        </section>
        <nav className={styles.tabs}>{tabs.map(item => <button key={item.id} className={tab === item.id ? styles.active : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
        {error && <div className={styles.error}>{error} <button onClick={() => setRetry(value => value + 1)}>Повторить</button></div>}
        {loading ? <div className={styles.state}>Загрузка данных...</div> : <section className={styles.content}>
            {tab === 'diary' && <Diary data={data.diary} offset={weekOffset} setOffset={setWeekOffset} />}
            {tab === 'grades' && <Grades data={data.grades} />}
            {tab === 'finals' && <Finals data={data.finals} />}
            {tab === 'analytics' && <AnalyticsView data={data} />}
        </section>}
    </main>;
}

function Diary({ data, offset, setOffset }: { data?: DiaryResponse; offset: number; setOffset: (value: number) => void }) {
    const days = Object.values(data?.diary || {});
    return <><div className={styles.toolbar}><button onClick={() => setOffset(offset - 1)}>← Раньше</button><b>{formatDate(data?.week_start)} — {formatDate(data?.week_end)}</b><button onClick={() => setOffset(offset + 1)}>Позже →</button></div>
        <div className={styles.days}>{days.map((day, index) => <article className={styles.day} key={index}><h3>{day.day_name || `День ${index + 1}`} · {formatDate(day.date)}{day.is_today ? ' · Сегодня' : ''}</h3>
            {!day.lessons.length && <p className={styles.muted}>Нет уроков</p>}
            {day.lessons.map(lesson => <div className={styles.lesson} key={`${lesson.lesson_number}-${lesson.subject_id}`}><span className={styles.number}>{lesson.lesson_number}</span><div><b>{lesson.subject_name} {lesson.status && lesson.status !== 'scheduled' && <span className={`${styles.badge} ${styles[lesson.status]}`}>{lesson.status === 'cancelled' ? 'Отменён' : 'Завершён'}</span>}</b><small>{lesson.start_time}–{lesson.end_time}{lesson.room ? ` · ${lesson.room}` : ''}</small>
                {lesson.homework.map(homework => <p className={styles.homework} key={homework.id}>ДЗ: {homework.title || homework.description}</p>)}
                {lesson.control_work && <p className={styles.control}>Контрольная: {lesson.control_work.title || lesson.control_work.work_type}</p>}</div></div>)}</article>)}</div></>;
}

function Grades({ data }: { data?: GradesResponse }) {
    if (!data?.grades.length) return <Empty text="Оценок пока нет" />;
    return <div className={styles.list}>{data.grades.map(grade => <article key={grade.id}><div><b>{grade.subject_name}</b><small>{grade.type} · {formatDate(grade.date)}{grade.topic ? ` · ${grade.topic}` : ''}</small></div><strong className={styles.grade}>{grade.value}</strong></article>)}</div>;
}

function Finals({ data }: { data?: ChildData['finals'] }) {
    if (!data?.final_grades.length) return <Empty text="Итоговые оценки ещё не выставлены" />;
    return <div className={styles.list}>{data.final_grades.map(grade => <article key={grade.id}><div><b>{grade.subject_name}</b><small>{grade.period_name || grade.grade_type}{grade.comment ? ` · ${grade.comment}` : ''}</small></div><strong className={styles.grade}>{grade.grade_value}</strong></article>)}</div>;
}

function AnalyticsView({ data }: { data: ChildData }) {
    return <div className={styles.analytics}>
        <div><h2>Средние по предметам</h2>{!data.summary?.subjects.length ? <Empty text="Недостаточно оценок" /> : <div className={styles.list}>{data.summary.subjects.map(subject => <article key={subject.subject_id}><div><b>{subject.subject_name}</b><small>{subject.count} оценок · {subject.points} баллов</small></div><strong>{subject.average}</strong></article>)}</div>}</div>
        <div><h2>Динамика по периодам</h2>{!data.analytics?.subjects.length ? <Empty text="Нет данных по периодам" /> : <div className={styles.table}>{data.analytics.subjects.map(subject => <div key={subject.subject_id}><b>{subject.subject_name}</b><span>{data.analytics?.periods.map(period => `${period.name}: ${subject.periods[String(period.id)] ?? '—'}`).join(' · ')}</span></div>)}</div>}</div>
        <div><h2>Движение баланса</h2>{!data.transactions?.transactions.length ? <Empty text="Операций пока нет" /> : <div className={styles.list}>{data.transactions.transactions.map(item => <article key={item.id}><div><b>{item.reason || item.type}</b><small>{formatDate(item.created_at)} · баланс {item.balance_after}</small></div><strong className={item.amount >= 0 ? styles.positive : styles.negative}>{item.amount > 0 ? '+' : ''}{item.amount}</strong></article>)}</div>}</div>
    </div>;
}

function Empty({ text }: { text: string }) { return <p className={styles.empty}>{text}</p>; }
