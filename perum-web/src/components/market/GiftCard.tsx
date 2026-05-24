/**
 * GiftCard — многослойная карточка улучшенного подарка.
 *
 * Слои (снизу вверх):
 *   1. .bg     — фоновое изображение/градиент (upgrade_bg_url)
 *   2. .pattern — полупрозрачный узор поверх фона (upgrade_pattern_url)
 *   3. .gift   — оригинальное изображение подарка (item.image_path)
 *
 * Анимации написаны исключительно через CSS @keyframes — без тяжелых библиотек.
 * При будущем переходе на Framer Motion/Reanimated достаточно заменить
 * className={styles.float} на motion-пропсы, не трогая логику слоёв.
 */
'use client';

import React from 'react';
import type { InventoryItem } from '@/types';
import styles from './GiftCard.module.css';

interface GiftCardProps {
  /** Запись инвентаря с информацией о подарке */
  inv: InventoryItem;
  /** Дополнительный CSS-класс для обёртки */
  className?: string;
}

export const GiftCard: React.FC<GiftCardProps> = ({ inv, className }) => {
  const isUpgraded = !!(inv.upgrade_bg_url || inv.upgrade_pattern_url);
  const bgUrl = inv.upgrade_bg_url ?? null;
  const patternUrl = inv.upgrade_pattern_url ?? null;
  const giftUrl = inv.upgrade_skin ?? inv.item.image_path ?? null;

  return (
    <div
      className={[
        styles.root,
        isUpgraded ? styles.upgraded : '',
        isUpgraded ? styles.float : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Подарок: ${inv.item.name}${isUpgraded ? ' (улучшен)' : ''}`}
    >
      {/* Слой 1: Фон */}
      {bgUrl ? (
        <div
          className={styles.bg}
          style={{ backgroundImage: `url(${bgUrl})` }}
          aria-hidden="true"
        />
      ) : (
        <div className={styles.bgDefault} aria-hidden="true" />
      )}

      {/* Слой 2: Узор */}
      {patternUrl && (
        <div
          className={styles.pattern}
          style={{ 
            backgroundImage: `url(${patternUrl})`,
            backgroundSize: inv.upgrade_pattern_mode === 'repeat' ? '40px' : (inv.upgrade_pattern_mode === 'contain' ? 'contain' : 'cover'),
            backgroundRepeat: inv.upgrade_pattern_mode === 'repeat' ? 'repeat' : 'no-repeat',
            backgroundPosition: 'center'
          }}
          aria-hidden="true"
        />
      )}

      {/* Слой 3: Сам подарок */}
      <div className={styles.giftLayer}>
        {giftUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={giftUrl}
            alt={inv.item.name}
            className={styles.giftImage}
            draggable={false}
          />
        ) : (
          <svg
            className={styles.placeholder}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <polyline points="20 12 20 22 4 22 4 12" />
            <rect x="2" y="7" width="20" height="5" />
            <line x1="12" y1="22" x2="12" y2="7" />
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
          </svg>
        )}
      </div>

      {/* Свечение (glow) поверх всего — только для улучшенных */}
      {isUpgraded && <div className={styles.glow} aria-hidden="true" />}
    </div>
  );
};
