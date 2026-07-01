'use client';

import Modal from '@/components/ui/Modal';
import styles from '../page.module.css';

interface FaqModalProps {
    onClose: () => void;
}

export default function FaqModal({ onClose }: FaqModalProps) {
    return (
        <Modal isOpen={true} onClose={onClose} title="Как работает рейтинг?" size="lg">
            <div className={styles.faqSection}>
                <h4>🏆 Что такое рейтинг?</h4>
                <p>Рейтинг — это система, которая показывает ТОП-10 лучших учеников по каждому предмету. Он обновляется автоматически на основе ваших оценок.</p>
            </div>
            <div className={styles.faqSection}>
                <h4>📊 Как распределяются места?</h4>
                <p>Место определяется по <strong>3 критериям</strong> (по приоритету):</p>
                <ol>
                    <li><strong>Средний балл</strong> — чем выше, тем лучше</li>
                    <li><strong>Количество «4» и «5»</strong> — при равном среднем выигрывает тот, у кого больше положительных оценок</li>
                    <li><strong>Общее количество оценок</strong> — при равных показателях выше тот, у кого больше выборка</li>
                </ol>
            </div>
            <div className={styles.faqSection}>
                <h4>⏳ Грейс-период</h4>
                <p>В первые <strong>5 дней</strong> каждого нового месяца рейтинг не формируется. Это время даётся на то, чтобы ученики успели получить достаточно оценок. В этот период вместо рейтинга отображается сообщение «Рейтинг формируется...».</p>
            </div>
            <div className={styles.faqSection}>
                <h4>📋 Минимальный порог</h4>
                <p>Чтобы попасть в рейтинг, нужно иметь <strong>не менее 1 оценки</strong> по предмету в текущем сезоне. Ученики без оценок не включаются в таблицу.</p>
            </div>
            <div className={styles.faqSection}>
                <h4>🔒 Скрытие среднего балла</h4>
                <p>Средний балл отображается только у учеников на <strong>1–4 местах</strong>. Для позиций <strong>5–10</strong> средний балл скрыт — это сделано для снижения конкуренции и стресса.</p>
            </div>
            <div className={styles.faqSection}>
                <h4>🎯 Область рейтинга</h4>
                <p><strong>1-9 классы:</strong> вы соревнуетесь со всеми учениками вашей параллели.</p>
                <p><strong>10-11 классы:</strong> рейтинг строится внутри вашего профильного класса.</p>
            </div>
            <div className={styles.faqSection}>
                <h4>📅 Сезон</h4>
                <p>Рейтинг обновляется <strong>каждый месяц</strong>. Каждый месяц — это новый сезон (всего 9 сезонов за учебный год). В начале месяца рейтинг начинается заново.</p>
            </div>
            <div className={styles.faqSection}>
                <h4>🥇 Награды</h4>
                <p>ТОП-3 получают бейджи:</p>
                <div className={styles.faqBadges}>
                    <span className={`${styles.faqBadge} ${styles.faqBadgeGold}`}>🥇 1 место — Золото</span>
                    <span className={`${styles.faqBadge} ${styles.faqBadgeSilver}`}>🥈 2 место — Серебро</span>
                    <span className={`${styles.faqBadge} ${styles.faqBadgeBronze}`}>🥉 3 место — Бронза</span>
                </div>
            </div>
        </Modal>
    );
}
