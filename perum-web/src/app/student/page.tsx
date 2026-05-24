'use client';

import { SkeletonCard } from '@/components/ui/Skeleton';
import NewsWidget from '@/components/dashboard/NewsWidget';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal';
import WalletHistoryModal from '@/components/modals/WalletHistoryModal';
import Link from 'next/link';
import { CoinIcon } from '@/components/ui/CoinIcon';
import styles from './page.module.css';

// Hooks
import { useStudentDashboard } from '@/hooks/useStudentDashboard';

// Components
import PasswordWarning from './_components/PasswordWarning';
import FaqModal from './_components/FaqModal';
import StudentModal from './_components/StudentModal';

export default function StudentMain() {
    const {
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
        handleClaimReward, handleTakeQuest, refreshData,
        seasons, selectedSeason, setSelectedSeason
    } = useStudentDashboard();

    const filteredQuests = allQuests.filter((q) => {
        if (questTab === 'active') {
            return q.status === 'active' || q.status === 'ready' || (q.status === 'completed' && !q.reward_claimed);
        }
        if (questTab === 'available') return q.status === 'available';
        if (questTab === 'completed') return q.status === 'completed' && q.reward_claimed;
        return false;
    });

    const availableQuestsCount = allQuests.filter(q => q.status === 'available').length;

    const getRankBadgeClass = (rank: number): string => {
        if (rank === 1) return styles.badgeGold;
        if (rank === 2) return styles.badgeSilver;
        if (rank === 3) return styles.badgeBronze;
        return '';
    };

    const getRankRowClass = (rank: number): string => {
        if (rank === 1) return styles.leaderboardRank1;
        if (rank === 2) return styles.leaderboardRank2;
        if (rank === 3) return styles.leaderboardRank3;
        return '';
    };

    const handleSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedSubject(Number(e.target.value));
    };

    return (
        <div className={styles.dashboard}>
            <PasswordWarning onChangePassword={() => setChangePwdOpen(true)} />

            {/* Top Level Tabs */}
            <div className={styles.topTabs}>
                <button
                    className={`${styles.topTab} ${activeTab === 'main' ? styles.topTabActive : ''}`}
                    onClick={() => setActiveTab('main')}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                    <span>Главная</span>
                </button>
                <button
                    className={`${styles.topTab} ${activeTab === 'news' ? styles.topTabActive : ''}`}
                    onClick={() => setActiveTab('news')}
                    style={{ position: 'relative' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                    <span>Новости</span>
                    {unreadNews > 0 && (
                        <span className={styles.unreadBadge}>
                            {unreadNews}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'news' ? (
                <div className={styles.newsTabContent}>
                    <NewsWidget className={styles.newsCardFull} />
                </div>
            ) : (
                <div className={styles.mainTabContent}>
                    <div className={styles.contentGrid}>
                        {/* Liquid Glass Balance Card */}
                        <div className={styles.balanceCard} style={{ gridArea: 'balance' }}>
                            <div className={styles.balanceInfo}>
                                <div className={styles.balanceHeader}>Мой счет</div>
                                <div className={styles.balanceAmount}>
                                    {user?.balance || 0} <CoinIcon id="dash-coin" className={styles.coinIcon} />
                                </div>
                            </div>
                            <div className={styles.balanceActions}>
                                <Link href="/exchange" className={styles.actionBtn}>
                                    <div className={styles.actionIcon} style={{ background: 'var(--accent-gradient)' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>
                                    </div>
                                    <span>Биржа</span>
                                </Link>
                                <Link href="/market" className={styles.actionBtn}>
                                    <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
                                    </div>
                                    <span>Маркет</span>
                                </Link>
                                <button onClick={() => setHistoryModalOpen(true)} className={styles.actionBtn}>
                                    <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #a855f7, #c084fc)' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="12 8 12 12 14 14" /><circle cx="12" cy="12" r="10" /></svg>
                                    </div>
                                    <span>История</span>
                                </button>
                            </div>
                        </div>

                        {/* ======== Квесты ======== */}
                        <section className={`${styles.card} ${styles.questsCard}`} style={{ gridArea: 'quests' }}>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>Квесты</h2>
                            </div>

                            <div className={styles.tabs}>
                                {(['active', 'available', 'completed'] as const).map((tab) => (
                                    <button
                                        key={tab}
                                        className={`${styles.tab} ${questTab === tab ? styles.tabActive : ''}`}
                                        onClick={() => setQuestTab(tab)}
                                    >
                                        {tab === 'active' ? 'Активные' : tab === 'available' ? (
                                            <>
                                                Доступные
                                                {availableQuestsCount > 0 && (
                                                    <span className={styles.questBadge}>{availableQuestsCount}</span>
                                                )}
                                            </>
                                        ) : 'Завершённые'}
                                    </button>
                                ))}
                            </div>

                            <div className={styles.questList}>
                                {questLoading ? (
                                    <><SkeletonCard /><SkeletonCard /></>
                                ) : filteredQuests.length === 0 ? (
                                    <div className={styles.empty}>
                                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M8 12h8M12 8v8" />
                                        </svg>
                                        <p>Нет квестов в этой категории</p>
                                    </div>
                                ) : (
                                    filteredQuests.slice(0, 5).map((quest) => (
                                        <div
                                            key={quest.id}
                                            className={`${styles.questItem} ${quest.reward_claimed ? styles.questItemClaimed : quest.status === 'completed' ? styles.questItemCompleted : ''}`}
                                        >
                                            <div className={styles.questInfo}>
                                                <div className={styles.questTitle}>{quest.title}</div>
                                                <div className={styles.questDesc}>{quest.description}</div>
                                                {quest.target > 0 && (quest.status === 'active' || quest.status === 'ready') && (
                                                    <div className={styles.questProgress}>
                                                        <div className={styles.progressBar}>
                                                            <div
                                                                className={styles.progressFill}
                                                                style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className={styles.progressText}>
                                                            {Math.round((quest.progress / quest.target) * 100)}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className={styles.questReward}>
                                                <div className={styles.rewardValue}>{quest.reward} <CoinIcon id={`quest-coin-${quest.id}`} size={16} /></div>
                                                {quest.status === 'ready' && !quest.reward_claimed && (
                                                    <button className={styles.claimBtn} onClick={() => handleClaimReward(quest.id!)}>Забрать</button>
                                                )}
                                                {quest.status === 'available' && (
                                                    <button className={styles.takeBtn} onClick={() => handleTakeQuest(quest.quest_id)}>Взять</button>
                                                )}
                                                {quest.reward_claimed && (
                                                    <div className={styles.claimedMark}>Получено</div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>

                        {/* ======== Рейтинг (Leaderboard) ======== */}
                        <section className={`${styles.card} ${styles.leaderboardCard}`} style={{ gridArea: 'leaderboard' }}>
                            <div className={styles.cardHeader}>
                                <h2 className={styles.cardTitle}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                                    </svg>
                                    Рейтинг
                                </h2>
                                <div className={styles.leaderboardHeaderRight}>
                                    <select 
                                        className={styles.leaderboardSeasonSelect}
                                        value={selectedSeason}
                                        onChange={(e) => setSelectedSeason(e.target.value)}
                                    >
                                        <option value="">Текущий ({leaderboardSeason || '...' })</option>
                                        {seasons.map(s => (
                                            <option key={`${s.month}-${s.year}`} value={`${s.month}-${s.year}`}>
                                                {s.label}
                                            </option>
                                        ))}
                                    </select>
                                    <button 
                                        className={styles.leaderboardFaqBtn} 
                                        title="Как работает рейтинг?"
                                        onClick={() => setShowFaqModal(true)}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"></circle>
                                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className={styles.leaderboardControls}>
                                <span className={styles.leaderboardScope}>{leaderboardScope}</span>
                                <select 
                                    className={styles.leaderboardSubjectSelect}
                                    value={selectedSubject}
                                    onChange={handleSubjectChange}
                                >
                                    {Array.isArray(subjects) && subjects.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.leaderboardContent}>
                                {leaderboardLoading ? (
                                    <SkeletonCard />
                                ) : leaderboardForming ? (
                                    <div className={styles.lbForming}>
                                        <div className={styles.lbFormingIcon}>⏳</div>
                                        <div className={styles.lbFormingTitle}>Рейтинг формируется...</div>
                                        <div className={styles.lbFormingText}>{leaderboardFormingMsg}</div>
                                    </div>
                                ) : leaderboard.length === 0 ? (
                                    <div className={styles.empty}>
                                        <p>В этом периоде оценок еще нет</p>
                                    </div>
                                ) : (
                                    <div className={styles.leaderboardList}>
                                        {(showAllLeaderboard ? leaderboard : leaderboard.slice(0, 5)).map((entry) => (
                                            <div
                                                key={entry.student.id}
                                                className={`${styles.leaderboardItem} ${getRankRowClass(entry.rank)} ${entry.student.login === user?.login ? styles.currentUser : ''}`}
                                                onClick={() => setSelectedStudent(entry)}
                                            >
                                                <div className={`${styles.rank} ${getRankBadgeClass(entry.rank)}`}>
                                                    {entry.rank}
                                                </div>
                                                <div className={styles.leaderboardAvatar}>
                                                    {entry.student.avatar_url ? (
                                                        <img 
                                                            src={entry.student.avatar_url} 
                                                            alt="Avatar" 
                                                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                                                        />
                                                    ) : (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                            <circle cx="12" cy="8" r="5"></circle>
                                                            <path d="M20 21a8 8 0 0 0-16 0"></path>
                                                        </svg>
                                                    )}
                                                </div>
                                                <div className={styles.leaderboardInfo}>
                                                    <span className={styles.leaderboardName}>
                                                        {entry.student.last_name} {entry.student.first_name}
                                                    </span>
                                                    <span className={styles.leaderboardClass}>{entry.student.class_name}</span>
                                                </div>
                                                <span className={styles.leaderboardAvg}>
                                                    {entry.rank <= 5 || entry.student.login === user?.login ? entry.avg.toFixed(2) : '—'}
                                                </span>
                                            </div>
                                        ))}

                                        {leaderboard.length > 5 && (
                                            <button className={styles.showMoreBtn} onClick={() => setShowAllLeaderboard(!showAllLeaderboard)}>
                                                {showAllLeaderboard ? 'Свернуть' : `Показать еще ${leaderboard.length - 5}`}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {/* Modals */}
            {changePwdOpen && <ChangePasswordModal isOpen={changePwdOpen} onClose={() => setChangePwdOpen(false)} />}
            {showFaqModal && <FaqModal onClose={() => setShowFaqModal(false)} />}
            {selectedStudent && <StudentModal entry={selectedStudent} onClose={() => setSelectedStudent(null)} />}
            {historyModalOpen && <WalletHistoryModal isOpen={true} onClose={() => setHistoryModalOpen(false)} />}
        </div>
    );
}
