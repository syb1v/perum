import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/apiClient';
import type { Quest, Subject, LeaderboardEntry, LeaderboardResponse } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export type MainTab = 'main' | 'news';
export type QuestTab = 'active' | 'available' | 'completed';

export function useStudentDashboard() {
    const { user, refreshUser } = useAuth();
    const { showError, showSuccess } = useToast();

    const [activeTab, setActiveTab] = useState<MainTab>('main');
    const [unreadNews, setUnreadNews] = useState(0);

    // Quests state
    const [allQuests, setAllQuests] = useState<Quest[]>([]);
    const [questTab, setQuestTab] = useState<QuestTab>('active');
    const [questLoading, setQuestLoading] = useState(true);

    // Leaderboard state
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedSubject, setSelectedSubject] = useState<number>(0);
    const [leaderboardLoading, setLeaderboardLoading] = useState(true);
    const [leaderboardScope, setLeaderboardScope] = useState('');
    const [leaderboardSeason, setLeaderboardSeason] = useState('');
    const [leaderboardForming, setLeaderboardForming] = useState(false);
    const [leaderboardFormingMsg, setLeaderboardFormingMsg] = useState('');
    const [showAllLeaderboard, setShowAllLeaderboard] = useState(false);

    // Modals state
    const [changePwdOpen, setChangePwdOpen] = useState(false);
    const [showFaqModal, setShowFaqModal] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<LeaderboardEntry | null>(null);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);

    // Seasons
    interface Season { month: number; year: number; label: string; }
    const pastSeasons = useCallback((): Season[] => {
        const seasons: Season[] = [];
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const startYear = currentMonth >= 9 ? currentYear : currentYear - 1;
        const academicMonths = [9, 10, 11, 12, 1, 2, 3, 4, 5];
        const MONTH_NAMES: Record<number, string> = {
            9: "Сентябрь", 10: "Октябрь", 11: "Ноябрь", 12: "Декабрь",
            1: "Январь", 2: "Февраль", 3: "Март", 4: "Апрель", 5: "Май"
        };
        for (const m of academicMonths) {
            const year = m >= 9 ? startYear : startYear + 1;
            if (year > currentYear || (year === currentYear && m > currentMonth)) break;
            seasons.push({ month: m, year, label: `${MONTH_NAMES[m]} ${year}` });
        }
        return seasons.reverse();
    }, []);

    const seasons = pastSeasons();
    const [selectedSeason, setSelectedSeason] = useState<string>('');

    // Fetch unread news count
    useEffect(() => {
        if (!user) return;
        api.get<{ unread_count: number }>('/news/unread-count')
            .then(res => setUnreadNews(res.unread_count))
            .catch(() => {});

        const handleNewsRead = () => setUnreadNews(prev => Math.max(0, prev - 1));
        window.addEventListener('news_read', handleNewsRead);
        return () => window.removeEventListener('news_read', handleNewsRead);
    }, [user]);

    const fetchQuests = useCallback(async () => {
        setQuestLoading(true);
        try {
            const res = await api.get<Quest[]>('/student/quests');
            setAllQuests(res);
        } catch {
            showError('Не удалось загрузить квесты');
        } finally {
            setQuestLoading(false);
        }
    }, [showError]);

    const fetchLeaderboard = useCallback(async (subjectId: number, seasonStr: string) => {
        if (!subjectId) return;
        setLeaderboardLoading(true);
        try {
            let url = `/leaderboard/${subjectId}`;
            if (seasonStr) {
                const [month, year] = seasonStr.split('-');
                url += `?month=${month}&year=${year}`;
            }
            const res = await api.get<LeaderboardResponse>(url);
            setLeaderboard(res.leaderboard || []);
            setLeaderboardScope(res.scope || '');
            setLeaderboardSeason(res.season || '');
            setLeaderboardForming(res.forming || false);
            setLeaderboardFormingMsg(res.forming_message || '');
        } catch {
            showError('Не удалось загрузить данные рейтинга');
        } finally {
            setLeaderboardLoading(false);
        }
    }, [showError]);

    const fetchSubjects = useCallback(async () => {
        try {
            const res = await api.get<{ subjects: Subject[] }>('/subjects');
            const subList = res.subjects || [];
            setSubjects(subList);
            if (subList.length > 0 && selectedSubject === 0) {
                setSelectedSubject(subList[0].id);
            }
        } catch {
            showError('Не удалось загрузить список предметов');
        }
    }, [selectedSubject, showError]);

    useEffect(() => {
        if (user) {
            fetchQuests();
            fetchSubjects();
        }
    }, [user, fetchQuests, fetchSubjects]);

    useEffect(() => {
        if (user && selectedSubject !== 0) {
            fetchLeaderboard(selectedSubject, selectedSeason);
        }
    }, [user, selectedSubject, selectedSeason, fetchLeaderboard]);

    const handleClaimReward = async (userQuestId: number) => {
        try {
            const res = await api.post<{ new_balance: number; message: string }>(`/quests/claim/${userQuestId}`);
            showSuccess(res.message);
            setAllQuests(prev => prev.map(q => q.id === userQuestId ? { ...q, status: 'completed', reward_claimed: true } : q));
            refreshUser();
        } catch {
            showError('Ошибка при получении награды');
        }
    };

    const handleTakeQuest = async (questId: number) => {
        try {
            await api.post(`/quests/take/${questId}`);
            showSuccess('Квест принят!');
            fetchQuests();
        } catch {
            showError('Ошибка при приеме квеста');
        }
    };

    return {
        user,
        activeTab, setActiveTab,
        unreadNews,
        allQuests, questTab, setQuestTab, questLoading,
        leaderboard, subjects, selectedSubject, setSelectedSubject,
        leaderboardLoading, leaderboardScope, leaderboardSeason,
        leaderboardForming, leaderboardFormingMsg, showAllLeaderboard, setShowAllLeaderboard,
        changePwdOpen, setChangePwdOpen,
        showFaqModal, setShowFaqModal,
        selectedStudent, setSelectedStudent,
        historyModalOpen, setHistoryModalOpen,
        handleClaimReward, handleTakeQuest,
        seasons, selectedSeason, setSelectedSeason,
        refreshData: () => { fetchQuests(); fetchSubjects(); fetchLeaderboard(selectedSubject, selectedSeason); }
    };
}
