/**
 * Главный экран (ТЗ п. 3 и п. 4).
 *
 * Требования:
 *  • шапка «VPN» + «Безопасный интернет в один клик»;
 *  • большая карточка состояния VPN;
 *  • активная подписка → «Управлять подпиской» + «Получить конфигурацию»;
 *  • нет подписки → «Купить VPN» + плитки преимуществ;
 *  • loading / error / empty состояния.
 */

import { useMemo } from 'react';
import { Button } from '@/components/Button';
import { AppName } from '@/components/AppName';
import { Logo } from '@/components/Logo';
import { ErrorState, NotInTelegramState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { HomeSkeleton } from '@/components/LoadingSkeleton';
import { FeatureGrid, Section } from '@/components/Layout';
import { Icon } from '@/components/Icon';
import { SubscriptionCard } from '@/components/SubscriptionCard';
import { useSession } from '@/hooks/useSession';
import { useRouter } from '@/lib/router';
import { APP_CONFIG } from '@/config/app';
import {
  formatDateCompact,
  hasSubscription,
  isSubscriptionActive,
} from '@/lib/format';
import { openTelegramLink } from '@/lib/telegram';

export default function HomePage() {
  const { user, subscription, loading, error, refresh, outsideTelegram } = useSession();
  const { navigate, reset } = useRouter();

  const active = isSubscriptionActive(subscription);
  const present = hasSubscription(subscription);

  const initials = useMemo(() => {
    if (!user) return '';
    const first = user.firstName.charAt(0);
    return first ? first.toUpperCase() : '';
  }, [user]);

  const brandHeader = {
    title: <AppName />,
    subtitle: APP_CONFIG.tagline,
    leading: <Logo size={44} />,
  };

  /* ── Вне Telegram ─────────────────────────────────────────────────────── */
  if (outsideTelegram) {
    return (
      <>
        <Header {...brandHeader} />
        <div className="screen screen--with-nav">
          <NotInTelegramState />
        </div>
      </>
    );
  }

  /* ── Ошибка ──────────────────────────────────────────────────────────── */
  if (error && !user) {
    return (
      <>
        <Header {...brandHeader} />
        <div className="screen screen--with-nav">
          <ErrorState
            title={error.isAuth ? 'Не удалось войти' : 'Не удалось загрузить данные'}
            message={error.message}
            onRetry={() => void refresh()}
          />
        </div>
      </>
    );
  }

  /* ── Загрузка ────────────────────────────────────────────────────────── */
  if (loading && !user) {
    return (
      <>
        <Header {...brandHeader} />
        <div className="screen screen--with-nav">
          <HomeSkeleton />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        {...brandHeader}
        action={
          <button
            type="button"
            className="avatar-btn"
            onClick={() => reset('profile')}
            aria-label="Открыть профиль"
          >
            <span className="avatar">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                initials || <Icon name="user" size={19} />
              )}
            </span>
          </button>
        }
      />

      <div className="screen screen--with-nav">
        {/* ── Статус подписки ─────────────────────────────────────────── */}
        {error && user && (
          <div className="card card--tight mb-4" style={{ borderColor: 'var(--c-warning)' }}>
            <div className="row-flex">
              <Icon name="alert" size={18} style={{ color: 'var(--c-warning)' }} />
              <span className="t-sm grow">{error.message}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => void refresh()}
              icon={<Icon name="refresh" size={16} />}
            >
              Обновить
            </Button>
          </div>
        )}

        <SubscriptionCard
          subscription={subscription}
          primaryLabel={active ? 'Управлять подпиской' : present ? 'Продлить подписку' : 'Купить VPN'}
          onPrimary={() => (present ? reset('subscription') : navigate('plans'))}
          onSecondary={() => navigate('vpn')}
        />

        {/* ── Преимущества, если подписки нет ─────────────────────────── */}
        {!present && (
          <Section title="Почему стоит подключиться">
            <FeatureGrid />
          </Section>
        )}

        {/* ── Быстрые действия ────────────────────────────────────────── */}
        {present && active && (
          <Section title="Быстрый доступ">
            <div className="rows">
              <QuickRow
                icon="download"
                title="Конфигурация VPN"
                sub="Скопировать или подключить"
                onClick={() => navigate('vpn')}
              />
              <QuickRow
                icon="book"
                title="Инструкция по подключению"
                sub="4 шага для вашего устройства"
                onClick={() => navigate('instructions')}
              />
              <QuickRow
                icon="card"
                title="Подписка и оплата"
                sub={`Действует до ${formatDateCompact(subscription?.expiresAt)}`}
                onClick={() => reset('subscription')}
              />
            </div>
          </Section>
        )}

        {!present && (
          <Section title="Как это работает">
            <div className="rows">
              <QuickRow
                icon="users"
                title="Пригласите друзей"
                sub="Получайте бонус с их покупок"
                onClick={() => reset('referrals')}
              />
              <QuickRow
                icon="help"
                title="Помощь"
                sub="Инструкции и поддержка"
                onClick={() => navigate('help')}
              />
            </div>
          </Section>
        )}

        {/* ── Реферальный баланс ──────────────────────────────────────── */}
        {user && (
          <ReferralTeaser
            onClick={() => reset('referrals')}
            avatarUrl={user.avatarUrl}
          />
        )}

        {APP_CONFIG.support.url && (
          <button
            type="button"
            className="row-flex mt-5"
            style={{ width: '100%', padding: '4px 4px', minHeight: 44 }}
            onClick={() => openTelegramLink(APP_CONFIG.support.url)}
          >
            <Icon name="help" size={17} style={{ color: 'var(--c-text-secondary)' }} />
            <span className="t-sm t-muted grow" style={{ textAlign: 'left' }}>
              Нужна помощь? Напишите в поддержку
            </span>
            <Icon name="chevron-right" size={17} style={{ color: 'var(--c-primary-300)' }} />
          </button>
        )}
      </div>
    </>
  );
}

function QuickRow({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="row__icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="row__body">
        <span className="row__title">{title}</span>
        <span className="row__sub">{sub}</span>
      </span>
      <span className="row__chevron">
        <Icon name="chevron-right" size={18} />
      </span>
    </button>
  );
}

/**
 * Плашка с реферальным балансом.
 * Баланс здесь — копия из /api/me (для пиктограммы), точное значение
 * показывает экран «Рефералы», который берёт цифры с backend.
 */
function ReferralTeaser({
  onClick,
  avatarUrl,
}: {
  onClick: () => void;
  avatarUrl?: string | null;
}) {
  return (
    <button
      type="button"
      className="card card--blue card--pressable mt-5"
      style={{ width: '100%', textAlign: 'left', padding: 14 }}
      onClick={onClick}
    >
      <div className="row-flex">
        <span className="row__icon" style={{ background: 'rgba(255,255,255,.9)' }}>
          <Icon name="gift" size={18} />
        </span>
        <span className="grow">
          <span className="row__title">Реферальная программа</span>
          <span className="row__sub">
            {avatarUrl ? 'Друзья приносят бонусы на баланс' : 'Приглашайте друзей и получайте бонус'}
          </span>
        </span>
        <Icon name="chevron-right" size={18} style={{ color: 'var(--c-primary-300)' }} />
      </div>
    </button>
  );
}