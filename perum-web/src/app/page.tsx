'use client';

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Кнопки «Войти» ведут на консоль на admin-поддомене (там логин платформы/орг),
  // т.к. лендинг живёт на корневом домене ядра. URL считается на клиенте из хоста.
  const [loginUrl, setLoginUrl] = useState('/platform/login');
  useEffect(() => {
    const h = window.location.hostname;
    if (!h.includes('.') || h === 'localhost') { setLoginUrl('/platform/login'); return; }
    if (h.startsWith('admin.')) { setLoginUrl('/platform/login'); return; }
    setLoginUrl(`${window.location.protocol}//admin.${h}/platform/login`);
  }, []);

  // Scroll animation observer and header scroll effect
  useEffect(() => {
    // Header scroll effect
    const header = document.querySelector(`.${styles['landing-header']}`);
    const handleScroll = () => {
      if (window.scrollY > 50) {
        header?.classList.add(styles['scrolled']);
      } else {
        header?.classList.remove(styles['scrolled']);
      }
    };
    window.addEventListener('scroll', handleScroll);

    // Animate on scroll
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add(styles['visible']);
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll(`.${styles['animate-on-scroll']}`);
    elements.forEach(el => observer.observe(el));

    // Active nav link based on scroll position
    const navLinks = document.querySelectorAll(`.${styles['landing-nav-link']}`);
    const sections = document.querySelectorAll('section[id]');

    const navObserverOptions = {
      threshold: 0.3,
      rootMargin: '-100px 0px -50% 0px'
    };

    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id;
          navLinks.forEach(link => {
            link.classList.remove(styles['active']);
            const href = link.getAttribute('href');
            if (href === `#${sectionId}`) {
              link.classList.add(styles['active']);
            }
          });
        }
      });
    }, navObserverOptions);

    sections.forEach(section => {
      navObserver.observe(section);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
      navObserver.disconnect();
    };
  }, []);

  const handleContactSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const data = {
      org_name: formData.get('org_name'),
      email: formData.get('email'),
      message: formData.get('message')
    };

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        alert('Обращение успешно отправлено! Мы свяжемся с вами в ближайшее время.');
        setIsContactModalOpen(false);
        (e.target as HTMLFormElement).reset();
      } else {
        const errorResponse = await response.json();
        alert('Ошибка: ' + (errorResponse.detail || 'Не удалось отправить обращение'));
      }
    } catch (error: unknown) {
      console.error("Networking error:", error);
      alert('Ошибка сети. Проверьте подключение к интернету.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={styles['landing-page']}>
      {/* Header */}
      <header className={styles['landing-header']} id="landing-header">
        <div className={styles['landing-logo']}>
          <div className={styles['landing-logo-icon']}>
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="currentColor" strokeWidth="2.5"
                strokeLinejoin="round" />
              <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="currentColor" />
            </svg>
          </div>
          <span className={styles['landing-logo-text']}><span>ПЭРУМ</span></span>
        </div>

        <nav className={styles['landing-nav']}>
          <div className={styles['landing-nav-links']}>
            <a href="#advantages" onClick={(e) => scrollToSection(e, 'advantages')} className={styles['landing-nav-link']} data-section="advantages">Преимущества</a>
            <a href="#partners" onClick={(e) => scrollToSection(e, 'partners')} className={styles['landing-nav-link']} data-section="partners">Партнёрам</a>
            <a href="#investors" onClick={(e) => scrollToSection(e, 'investors')} className={styles['landing-nav-link']} data-section="investors">Инвесторам</a>
            <a href="#modules" onClick={(e) => scrollToSection(e, 'modules')} className={styles['landing-nav-link']} data-section="modules">Платформа</a>
          </div>
          <a href={loginUrl} className={styles['landing-login-btn']}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Войти
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <section className={styles['hero-section']}>
        <div className={styles['hero-bg']}></div>
        <div className={styles['hero-particles']}>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
          <div className={styles['particle']}></div>
        </div>

        <div className={styles['hero-content']}>
          <div className={styles['hero-badge']}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon
                points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            EdTech платформа нового поколения
          </div>

          <h1 className={styles['hero-title']}>
            Инвестируйте в<br />
            <span className={styles['gradient-text']}>будущее образования</span>
          </h1>

          <p className={styles['hero-subtitle']}>
            Система управления школой с доказанным ростом успеваемости. Экономит до 10 часов
            в неделю завучам и учителям, решает проблемы с дисциплиной за счет инструментов
            геймификации и дает прозрачную аналитику для работы с качеством образования.
          </p>

          <div className={styles['hero-actions']}>
            <a href="#contact" onClick={(e) => scrollToSection(e, 'contact')} className={styles['hero-btn-primary']}>
              Подключить школу
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </a>
            <a href="#advantages" onClick={(e) => scrollToSection(e, 'advantages')} className={styles['hero-btn-secondary']}>
              Узнать больше
            </a>
          </div>

          <div className={styles['hero-stats']}>
            <div className={styles['hero-stat']}>
              <div className={styles['hero-stat-value']}>10 ч</div>
              <div className={styles['hero-stat-label']}>Экономия в неделю</div>
            </div>
            <div className={styles['hero-stat']}>
              <div className={styles['hero-stat-value']}>2 500+</div>
              <div className={styles['hero-stat-label']}>Активных учеников</div>
            </div>
            <div className={styles['hero-stat']}>
              <div className={styles['hero-stat-value']}>+15%</div>
              <div className={styles['hero-stat-label']}>Рост успеваемости</div>
            </div>
          </div>
        </div>
      </section>

      {/* Advantages Section */}
      <section className={styles['advantages-section']} id="advantages">
        <div className={styles['section-header']}>
          <span className={styles['section-tag']}>Почему ПЭРУМ</span>
          <h2 className={styles['section-title']}>Конкурентные преимущества</h2>
          <p className={styles['section-description']}>
            Уникальное сочетание технологий и методик, которое выделяет нас на рынке EdTech
          </p>
        </div>

        <div className={styles['advantages-grid']}>
          {/* Advantage 1 */}
          <div className={`${styles['advantage-card']} ${styles['animate-on-scroll']}`}>
            <div className={styles['advantage-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3 className={styles['advantage-title']}>Геймификация обучения</h3>
            <p className={styles['advantage-description']}>
              Уникальная система ливок, квестов и достижений повышает мотивацию учеников
              и вовлечённость в учебный процесс на 40-60%.
            </p>
          </div>

          {/* Advantage 2 */}
          <div className={`${styles['advantage-card']} ${styles['animate-on-scroll']}`}>
            <div className={styles['advantage-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3 className={styles['advantage-title']}>Экономия времени</h3>
            <p className={styles['advantage-description']}>
              Автоматизация рутинных задач учителей. Электронный журнал, аналитика
              и отчётность — всё в одном месте.
            </p>
          </div>

          {/* Advantage 3 */}
          <div className={`${styles['advantage-card']} ${styles['animate-on-scroll']}`}>
            <div className={styles['advantage-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className={styles['advantage-title']}>Спокойствие родителей</h3>
            <p className={styles['advantage-description']}>
              Полная прозрачность учебного процесса. Родитель видит позитивный 
              тренд развития ребенка, а не только сухие оценки в конце четверти.
            </p>
          </div>

          {/* Advantage 4 */}
          <div className={`${styles['advantage-card']} ${styles['animate-on-scroll']}`}>
            <div className={styles['advantage-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <h3 className={styles['advantage-title']}>White Label решение</h3>
            <p className={styles['advantage-description']}>
              Возможность брендирования платформы под стиль вашей организации.
              Полная кастомизация интерфейса и функционала.
            </p>
          </div>

          {/* Advantage 5 */}
          <div className={`${styles['advantage-card']} ${styles['animate-on-scroll']}`}>
            <div className={styles['advantage-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3 className={styles['advantage-title']}>Глубокая аналитика</h3>
            <p className={styles['advantage-description']}>
              Детальные отчёты по успеваемости, выявление слабых мест и персонализированные
              рекомендации для каждого ученика.
            </p>
          </div>

          {/* Advantage 6 */}
          <div className={`${styles['advantage-card']} ${styles['animate-on-scroll']}`}>
            <div className={styles['advantage-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className={styles['advantage-title']}>Масштабируемость</h3>
            <p className={styles['advantage-description']}>
              От одной школы до сети образовательных учреждений. Архитектура платформы
              позволяет легко масштабироваться.
            </p>
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className={styles['partners-section']} id="partners">
        <div className={styles['section-header']}>
          <span className={styles['section-tag']}>Для организаций</span>
          <h2 className={styles['section-title']}>Станьте партнёром ПЭРУМ</h2>
          <p className={styles['section-description']}>
            Предлагаем выгодные условия сотрудничества для образовательных учреждений и организаций
          </p>
        </div>

        <div className={styles['partners-grid']}>
          {/* Partner Card 1: Schools */}
          <div className={`${styles['partner-card']} ${styles['animate-on-scroll']}`} data-partner="school">
            <div className={styles['partner-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h3 className={styles['partner-title']}>Частные школы и лицеи</h3>
            <p className={styles['partner-description']}>
              Современная платформа для вашей школы. Повысьте привлекательность
              учреждения для родителей и выделитесь на рынке образования.
            </p>
            <div className={styles['partner-benefits']}>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Полный доступ ко всем модулям</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Техническая поддержка</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Обучение персонала</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Гибкие тарифные планы</span>
              </div>
            </div>
          </div>

          {/* Partner Card 2: Employers */}
          <div className={`${styles['partner-card']} ${styles['animate-on-scroll']}`} data-partner="employer">
            <div className={styles['partner-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
            <h3 className={styles['partner-title']}>Работодатели (B2B)</h3>
            <p className={styles['partner-description']}>
              Формируйте кадровый резерв со школьной скамьи и укрепляйте HR-бренд.
              Спонсируйте школы, добавляйте свои «Квесты» и награждайте таланты.
            </p>
            <div className={styles['partner-benefits']}>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Корпоративные спец-квесты</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Профильные стипендии</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Поддержка социальной среды региона</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Брендирование в Маркете</span>
              </div>
            </div>
          </div>

          {/* Partner Card 3: EdTech */}
          <div className={`${styles['partner-card']} ${styles['animate-on-scroll']}`} data-partner="edtech">
            <div className={styles['partner-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3 className={styles['partner-title']}>Образовательные платформы</h3>
            <p className={styles['partner-description']}>
              Дополните вашу платформу модулями геймификации
              и повысьте вовлечённость пользователей.
            </p>
            <div className={styles['partner-benefits']}>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Интеграция модулей</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Кастомизация под ваш бренд</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Совместный маркетинг</span>
              </div>
              <div className={styles['partner-benefit']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Техническое сопровождение</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Deployment Section (Replaced Investors) */}
      <section className={styles['investors-section']} id="investors">
        <div className={styles['section-header']}>
          <span className={styles['section-tag']}>Внедрение и тарификация</span>
          <h2 className={styles['section-title']}>Гибкие форматы работы</h2>
          <p className={styles['section-description']}>
            Мы понимаем специфику бюджетирования образовательных учреждений и предлагаем
            модели, удобные как для государственных, так и для частных инициатив
          </p>
        </div>

        <div className={styles['investors-content']}>
          <div className={`${styles['investors-info']} ${styles['animate-on-scroll']}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <div className={styles['investor-info-card']}>
              <h3 className={styles['investor-info-title']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M16 8l-4 4-2-2-4 4" />
                  <polyline points="16 12 16 8 12 8" />
                </svg>
                Freemium (B2G)
              </h3>
              <p>Для государственных школ. Базовый электронный журнал и инструменты геймификации — бесплатно.</p>
              <ul className={styles['investor-info-list']}>
                <li>Бесплатный старт для школы</li>
                <li>Премиум-аналитика для завуча и директора (оплата из фондов или субсидий)</li>
                <li>Повышение KPI школы в региональном рейтинге</li>
              </ul>
            </div>

            <div className={styles['investor-info-card']}>
              <h3 className={styles['investor-info-title']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
                Спонсорство (B2B)
              </h3>
              <p>Для бизнеса и корпораций. Целевая поддержка подшефных школ.</p>
              <ul className={styles['investor-info-list']}>
                <li>Компания оплачивает платформу для школы</li>
                <li>Внедрение брендированных образовательных квестов</li>
                <li>Ранний хантинг талантов и развитие лояльности к бренду</li>
              </ul>
            </div>

            <div className={styles['investor-info-card']}>
              <h3 className={styles['investor-info-title']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                White Label
              </h3>
              <p>Для частных школ. Полностью независимая инсталляция с персональным брендингом.</p>
              <ul className={styles['investor-info-list']}>
                <li>Собственный логотип и домен школы</li>
                <li>Полный контроль над базой данных</li>
                <li>Мощное конкурентное преимущество перед другими лицеями</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Modules Section */}
      <section className={styles['modules-section']} id="modules">
        <div className={styles['section-header']}>
          <span className={styles['section-tag']}>Функционал</span>
          <h2 className={styles['section-title']}>Модули платформы</h2>
          <p className={styles['section-description']}>
            ПЭРУМ объединяет шесть ключевых модулей, которые работают как единая экосистема
          </p>
        </div>

        <div className={styles['modules-grid']}>
          {/* Module: Journal */}
          <div className={`${styles['module-card']} ${styles['animate-on-scroll']}`} data-module="journal">
            <div className={styles['module-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="8" y1="7" x2="16" y2="7" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </div>
            <h3 className={styles['module-title']}>Электронный журнал</h3>
            <p className={styles['module-description']}>
              Фиксация оценок, тем работ и домашних заданий. Основной источник данных
              для аналитики и начисления ливок.
            </p>
          </div>

          {/* Module: Points */}
          <div className={`${styles['module-card']} ${styles['animate-on-scroll']}`} data-module="points">
            <div className={styles['module-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M16 8l-4 4-2-2-4 4" />
                <polyline points="16 12 16 8 12 8" />
              </svg>
            </div>
            <h3 className={styles['module-title']}>Система ливок</h3>
            <p className={styles['module-description']}>
              Внутренняя учебная валюта. Положительные оценки увеличивают баланс,
              используйте ливки для покупок и участия в биржевых операциях.
            </p>
          </div>

          {/* Module: Analytics */}
          <div className={`${styles['module-card']} ${styles['animate-on-scroll']}`} data-module="analytics">
            <div className={styles['module-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <h3 className={styles['module-title']}>Аналитика</h3>
            <p className={styles['module-description']}>
              Обработка данных журнала, формирование статистики по предметам и классам,
              отслеживание динамики успеваемости.
            </p>
          </div>

          {/* Module: Exchange */}
          <div className={`${styles['module-card']} ${styles['animate-on-scroll']}`} data-module="exchange">
            <div className={styles['module-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <h3 className={styles['module-title']}>Биржа</h3>
            <p className={styles['module-description']}>
              Индексы по предметам на основе средних баллов класса. Совершайте вкладные
              операции и учитесь финансовой грамотности.
            </p>
          </div>

          {/* Module: Quests */}
          <div className={`${styles['module-card']} ${styles['animate-on-scroll']}`} data-module="quests">
            <div className={styles['module-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
            <h3 className={styles['module-title']}>Квесты</h3>
            <p className={styles['module-description']}>
              Автоматические задания при выявлении слабых тем после анализа оценок.
              Выполняйте квесты и получайте награды.
            </p>
          </div>

          {/* Module: Shop */}
          <div className={`${styles['module-card']} ${styles['animate-on-scroll']}`} data-module="shop">
            <div className={styles['module-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <h3 className={styles['module-title']}>Магазин украшений</h3>
            <p className={styles['module-description']}>
              Приобретайте рамки, фоны и другие элементы профиля за ливки.
              Ограниченные тиражи и возможность обмена между аккаунтами.
            </p>
          </div>
        </div>
      </section>

      {/* Contact CTA Section */}
      <section className={styles['cta-section']} id="contact">
        <div className={styles['cta-bg']}></div>
        <div className={`${styles['cta-content']} ${styles['animate-on-scroll']}`}>
          <h2 className={styles['cta-title']}>Готовы к сотрудничеству?</h2>
          <p className={styles['cta-description']}>
            Свяжитесь с нами для обсуждения партнёрства, инвестиций или лицензирования платформы.
            Мы открыты к диалогу и готовы ответить на все ваши вопросы.
          </p>
          <div className={styles['cta-buttons']}>
            <button type="button" onClick={() => setIsContactModalOpen(true)} className={styles['cta-btn']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Написать нам
            </button>
            <a href={loginUrl} className={styles['cta-btn-secondary']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Войти в систему
            </a>
          </div>
        </div>
      </section>

      {/* Audience Section */}
      <section className={styles['audience-section']} id="audience">
        <div className={styles['section-header']}>
          <span className={styles['section-tag']}>Пользователи</span>
          <h2 className={styles['section-title']}>Для кого создан ПЭРУМ?</h2>
          <p className={styles['section-description']}>
            Платформа разработана для всех участников образовательного процесса
          </p>
        </div>

        <div className={styles['audience-grid']}>
          {/* Student Card */}
          <div className={`${styles['audience-card']} ${styles['animate-on-scroll']}`} data-audience="student">
            <div className={styles['audience-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2v-5" />
              </svg>
            </div>
            <h3 className={styles['audience-title']}>Для учеников</h3>
            <p className={styles['audience-description']}>
              Превратите учёбу в увлекательную игру. Зарабатывайте ливки,
              соревнуйтесь в рейтингах и достигайте новых высот.
            </p>
            <div className={styles['audience-features']}>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Просмотр оценок и аналитики</span>
              </div>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Участие в квестах и биржевых операциях</span>
              </div>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Покупка и обмен украшений профиля</span>
              </div>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Отслеживание позиции в рейтинге</span>
              </div>
            </div>
          </div>

          {/* Teacher Card */}
          <div className={`${styles['audience-card']} ${styles['animate-on-scroll']}`} data-audience="teacher">
            <div className={styles['audience-icon']}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <h3 className={styles['audience-title']}>Для учителей</h3>
            <p className={styles['audience-description']}>
              Удобные инструменты для работы с классом. Аналитика, отчёты
              и полный контроль над учебным процессом.
            </p>
            <div className={styles['audience-features']}>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Выставление оценок и указание тем работ</span>
              </div>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Доступ к аналитике класса и предметов</span>
              </div>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Работа с электронным журналом</span>
              </div>
              <div className={styles['audience-feature']}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Формирование отчётности</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles['landing-footer']}>
        <div className={styles['footer-content']}>
          <div className={styles['footer-logo']}>
            <div className={styles['footer-logo-icon']}>
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="currentColor" strokeWidth="2.5"
                  strokeLinejoin="round" />
                <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="currentColor" />
              </svg>
            </div>
            <span className={styles['footer-logo-text']}>ПЭРУМ</span>
          </div>
          <div className={styles['footer-links']}>
            <a href="mailto:contact@perum.ru" className={styles['footer-link']}>contact@perum.ru</a>
            <span className={styles['footer-divider']}>•</span>
            <a href="#partners" onClick={(e) => scrollToSection(e, 'partners')} className={styles['footer-link']}>Партнёрство</a>
            <span className={styles['footer-divider']}>•</span>
            <a href="#investors" onClick={(e) => scrollToSection(e, 'investors')} className={styles['footer-link']}>Инвесторам</a>
          </div>
          <p className={styles['footer-text']}>© 2026 Платформа Экономико-Аналитического Развития Учащейся Молодёжи</p>
        </div>
      </footer>

      {/* Contact Modal */}
      <div
        className={`${styles['contact-modal-overlay']} ${isContactModalOpen ? styles['active'] : ''}`}
        id="contact-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsContactModalOpen(false);
        }}
      >
        <div className={styles['contact-modal']}>
          <button type="button" onClick={() => setIsContactModalOpen(false)} className={styles['contact-modal-close']} id="close-contact-modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h3 className={styles['contact-modal-title']}>Связаться с нами</h3>
          <p className={styles['contact-modal-description']}>Заполните форму и мы свяжемся с вами в ближайшее время</p>
          <form className={styles['contact-form']} id="contact-form" onSubmit={handleContactSubmit}>
            <div className={styles['contact-form-group']}>
              <label htmlFor="org-name">Название организации</label>
              <input type="text" id="org-name" name="org_name" placeholder="Введите название" required />
            </div>
            <div className={styles['contact-form-group']}>
              <label htmlFor="contact-email">Email для связи</label>
              <input type="email" id="contact-email" name="email" placeholder="example@domain.ru" required />
            </div>
            <div className={styles['contact-form-group']}>
              <label htmlFor="message">Сообщение</label>
              <textarea id="message" name="message" placeholder="Опишите ваш вопрос или предложение..."
                rows={4} required></textarea>
            </div>
            <button type="submit" className={styles['contact-form-submit']} disabled={isSubmitting}>
              {isSubmitting ? (
                <span>Отправка...</span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Отправить сообщение
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
