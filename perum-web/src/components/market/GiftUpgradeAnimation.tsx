/**
 * GiftUpgradeAnimation — Telegram-style раскрытие улучшенного подарка.
 *
 * Используется при клике «Улучшить» в инвентаре ученика. Сам по себе ничего
 * не делает с API — родитель передаёт фазу и данные:
 *
 *   1. phase='spinning'  → подарок крутится поверх пульсирующего фона
 *      (показывается пока ждём ответ POST /market/upgrade/:id)
 *   2. phase='revealing' → вспышка → bg+pattern проявляются → конфетти →
 *      бейдж «Улучшено», подарок переходит в floating
 *
 * Закрывается по клику на оверлей или кнопку «Готово». На onClose родителю
 * стоит перезагрузить инвентарь — это даст финальный skin + pattern_mode
 * от сервера через GiftCard.
 */
'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem } from '@/types';
import styles from './GiftUpgradeAnimation.module.css';

export type UpgradePhase =
  | { phase: 'spinning'; inv: InventoryItem }
  | { phase: 'revealing'; inv: InventoryItem; bgUrl: string; patternUrl: string };

interface Props {
  data: UpgradePhase | null;
  onClose: () => void;
}

const CONFETTI_COUNT = 18;

export const GiftUpgradeAnimation: React.FC<Props> = ({ data, onClose }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!data) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && data.phase === 'revealing') onClose();
    };
    document.addEventListener('keydown', onEsc);
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
    };
  }, [data, onClose]);

  if (!mounted || !data) return null;

  const inv = data.inv;
  const isRevealing = data.phase === 'revealing';
  const giftSrc = inv.upgrade_skin ?? inv.item.image_path ?? null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={isRevealing ? onClose : undefined}
      role="dialog"
      aria-label={`Улучшение подарка ${inv.item.name}`}
    >
      <div
        className={[styles.stage, isRevealing ? styles.stageReveal : styles.stageSpin]
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Слой 1: фон (только в revealing) */}
        {isRevealing && (
          <div
            className={styles.bgLayer}
            style={{ backgroundImage: `url(${data.bgUrl})` }}
            aria-hidden="true"
          />
        )}

        {/* Слой 2: pattern (только в revealing) */}
        {isRevealing && (
          <div
            className={styles.patternLayer}
            style={{ backgroundImage: `url(${data.patternUrl})` }}
            aria-hidden="true"
          />
        )}

        {/* Радиальное свечение под подарком */}
        <div className={styles.haloLayer} aria-hidden="true" />

        {/* Сам подарок */}
        <div className={styles.giftLayer}>
          {giftSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={giftSrc} alt={inv.item.name} className={styles.giftImg} draggable={false} />
          ) : (
            <div className={styles.giftPlaceholder}>🎁</div>
          )}
        </div>

        {/* Вспышка при reveal */}
        {isRevealing && <div className={styles.flash} aria-hidden="true" />}

        {/* Конфетти при reveal */}
        {isRevealing && (
          <div className={styles.confettiBox} aria-hidden="true">
            {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
              <span
                key={i}
                className={styles.confetti}
                style={{ '--i': i } as React.CSSProperties}
              />
            ))}
          </div>
        )}
      </div>

      {/* Подпись под сценой */}
      <div className={[styles.caption, isRevealing ? styles.captionReveal : ''].join(' ')}>
        {isRevealing ? (
          <>
            <div className={styles.captionTitle}>✨ Улучшен!</div>
            <div className={styles.captionSubtitle}>{inv.item.name}</div>
            <button className={styles.doneBtn} onClick={onClose} type="button">
              Готово
            </button>
          </>
        ) : (
          <div className={styles.captionTitle}>Улучшаем…</div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default GiftUpgradeAnimation;
