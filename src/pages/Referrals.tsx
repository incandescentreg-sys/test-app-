/**
 * Экран «Пригласи друзей» (ТЗ п. 13 и п. 14).
 *
 * Правила:
 *  • referral ID НЕ редактируется — его собирает backend;
 *  • баланс берётся с backend и НЕ считается на клиенте;
 *  • минимальная сумма вывода — из `/api/health`;
 *  • все финансовые проверки дублируются на сервере (фронт — только UX).
 */

import { useCallback, useState } from 'react';
import { createWithdrawal, getReferralStats } from '@/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorState, EmptyState } from '@/components/EmptyState';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { ReferralSkeleton } from '@/components/LoadingSkeleton';
import { Modal } from '@/components/Modal';
import { Section } from '@/components/Layout';
import { StatPill } from '@/components/SubscriptionCard';
import { useAsync } from '@/hooks/useAsync';
import { useSession } from '@/hooks/useSession';
import { useToast } from '@/hooks/useToast';
import { APP_CONFIG, COPY } from '@/config/app';
import { useRouter } from '@/lib/router';
import { formatDateCompact, formatMoney } from '@/lib/format';
import { haptic, shareUrl, supportsNativeShare } from '@/lib/telegram';
import type { ReferralStats } from '@/types';

const SHARE_TEXT = 'Приглашаю тебя VPN — безопасный и быстрый интернет в один клик.';

export default function ReferralsPage() {
  const { health } = useSession();
  const { navigate } = useRouter();
  const toast = useToast();

  const [showWithdraw, setShowWithdraw] = useState(false);

  const state = useAsync<ReferralStats>(
    useCallback((signal) => getReferralStats(signal), []),
    [],
  );

  const stats = state.data;

  const handleShare = useCallback(() => {
    const link = stats?.referralLink;
    if (!link) {
      toast.error('Ссылка пока недоступна');
      return;
    }
    haptic.medium();
    const result = shareUrl(link, SHARE_TEXT);

    if (result === 'native') {
      toast.success('Открываем меню «Поделиться»');
    } else if (result === 'fallback') {
      // Открылось системное окно Telegram — сообщение не нужно.
    } else {
      toast.error('Не удалось открыть меню «Поделиться»');
    }
  }, [stats?.referralLink, toast]);

  return (
    <>
      <Header title="Пригласи друзей" subtitle="Бонусы с покупок приглашённых" />

      <div className="screen screen--with-nav">
        {state.loading && !stats ? (
          <ReferralSkeleton />
        ) : state.error && !stats ? (
          <ErrorState message={state.error.message} onRetry={() => void state.refetch()} />
        ) : !stats ? (
          <EmptyState
            icon="users"
            title="Данные недоступны"
            actionLabel="Обновить"
            onAction={() => void state.refetch()}
          />
        ) : (
          <>
            {/* ── Три ключевые цифры ─────────────────────────────────── */}
            <div className="row-flex" style={{ gap: 10 }}>
              <StatPill value={String(stats.invitedCount)} label="Приглашено" />
              <StatPill value={formatMoney(stats.totalEarnings, stats.currency)} label="Заработано" />
              <StatPill value={formatMoney(stats.balance, stats.currency)} label="Баланс" />
            </div>

            {/* ── Приглашение ─────────────────────────────────────────── */}
            <Card tone="blue" className="hero mt-4" appear>
              <div className="row-flex" style={{ gap: 12 }}>
                <span className="hero__icon">
                  <Icon name="users" size={24} />
                </span>
                <div className="grow">
                  <h2 className="t-h3">Приглашайте друзей</h2>
                  <p className="t-sm t-muted mt-2" style={{ lineHeight: 1.45 }}>
                    Получайте{' '}
                    <span className="t-bold" style={{ color: 'var(--c-primary-dark)' }}>
                      {stats.bonusPercent}%
                    </span>{' '}
                    с их покупок. Деньги поступают на баланс автоматически.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <Button
                  onClick={handleShare}
                  icon={<Icon name="share" size={18} />}
                >
                  Поделиться ссылкой
                </Button>
              </div>

              {!supportsNativeShare() && (
                <p className="t-xs t-muted mt-3" style={{ textAlign: 'center' }}>
                  Откроется стандартное меню «Поделиться» Telegram
                </p>
              )}
            </Card>

            {/* ── Баланс и вывод ──────────────────────────────────────── */}
            <Section title="Баланс">
              <Card>
                <div className="row-flex row-flex--between mb-4">
                  <div>
                    <div className="t-sm t-muted">Доступно к выводу</div>
                    <div className="t-price mt-2">{formatMoney(stats.balance, stats.currency)}</div>
                  </div>
                  <span className="row__icon" style={{ width: 44, height: 44 }}>
                    <Icon name="wallet" size={22} />
                  </span>
                </div>

                {stats.pendingEarnings != null && stats.pendingEarnings > 0 && (
                  <div className="t-sm t-muted mb-4">
                    В ожидании: {formatMoney(stats.pendingEarnings, stats.currency)}
                  </div>
                )}

                <Button
                  variant="secondary"
                  onClick={() => {
                    haptic.light();
                    setShowWithdraw(true);
                  }}
                  icon={<Icon name="download" size={18} />}
                >
                  Вывести средства
                </Button>

                {stats.balance === 0 && (
                  <p className="t-xs t-muted mt-3" style={{ textAlign: 'center' }}>
                    Пока доступно к выводу 0 ₽. Пригласите друзей, чтобы заработать бонус.
                  </p>
                )}
              </Card>
            </Section>

            {/* ── Приглашённые ────────────────────────────────────────── */}
            <Section title={`Приглашено (${stats.invitedCount})`}>
              {stats.recent.length === 0 ? (
                <EmptyState
                  icon="users"
                  emoji="👥"
                  title="Пока никого нет"
                  text="Поделитесь ссылкой — и бонус появится здесь."
                  actionLabel="Поделиться ссылкой"
                  onAction={handleShare}
                />
              ) : (
                <div className="rows">
                  {stats.recent.map((entry) => (
                    <div className="row" key={entry.userId}>
                      <span className="row__icon" style={{ fontSize: 16 }}>
                        {entry.avatarUrl ? '' : entry.displayName.charAt(0).toUpperCase()}
                        {entry.avatarUrl && (
                          <img
                            src={entry.avatarUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover' }}
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </span>
                      <span className="row__body">
                        <span className="row__title">
                          {entry.displayName}
                          {entry.username ? ` @${entry.username}` : ''}
                        </span>
                        <span className="row__sub">
                          {entry.credited
                            ? `Бонус начислен · ${formatDateCompact(entry.registeredAt)}`
                            : `Ожидает оплаты · ${formatDateCompact(entry.registeredAt)}`}
                        </span>
                      </span>
                      <span
                        className="row__value"
                        style={{ color: entry.credited ? 'var(--c-success)' : 'var(--c-text-secondary)' }}
                      >
                        +{formatMoney(entry.earned, stats.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── История вывода ──────────────────────────────────────── */}
            {stats.withdrawals.length > 0 && (
              <Section title="История вывода">
                <div className="rows">
                  {stats.withdrawals.slice(0, 5).map((w) => (
                    <div className="row" key={w.id}>
                      <span className="row__icon">
                        <Icon name="wallet" size={16} />
                      </span>
                      <span className="row__body">
                        <span className="row__title">
                          {formatMoney(w.amount, stats.currency)}
                        </span>
                        <span className="row__sub">{formatDateCompact(w.createdAt)}</span>
                      </span>
                      <WithdrawalStatus status={w.status} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Про VPN ─────────────────────────────────────────────── */}
            <div className="mt-5">
              <Button variant="ghost" onClick={() => navigate('instructions')} icon={<Icon name="book" size={17} />}>
                Инструкция по подключению
              </Button>
            </div>
          </>
        )}
      </div>

      <WithdrawModal
        open={showWithdraw}
        balance={stats?.balance ?? 0}
        currency={stats?.currency ?? APP_CONFIG.currency}
        minAmount={health?.app.minWithdrawalAmount ?? 50000}
        onClose={() => setShowWithdraw(false)}
        onDone={() => {
          setShowWithdraw(false);
          void state.refetch();
        }}
      />
    </>
  );
}

function WithdrawalStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'В обработке', cls: 'badge--warn' },
    approved: { label: 'Одобрено', cls: 'badge--info' },
    paid: { label: 'Выполнено', cls: 'badge--active' },
    rejected: { label: 'Отклонено', cls: 'badge--off' },
    cancelled: { label: 'Отменено', cls: 'badge--off' },
  };
  const item = map[status] ?? { label: 'В обработке', cls: 'badge--warn' };
  return <span className={`badge ${item.cls}`}>{item.label}</span>;
}

/* ── Форма вывода (ТЗ п. 14) ──────────────────────────────────────────── */

function WithdrawModal({
  open,
  balance,
  currency,
  minAmount,
  onClose,
  onDone,
}: {
  open: boolean;
  balance: number;
  currency: string;
  minAmount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amountRaw, setAmountRaw] = useState('');
  const [requisites, setRequisites] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Math.round(Number(amountRaw.replace(/\s/g, '')) * 100);
  const valid = Number.isFinite(amount) && amount > 0;

  /**
   * Валидация — только для удобства пользователя.
   * Реальная проверка (минимальная сумма, наличие средств, лимит заявок)
   * выполняется на backend'е, которому мы доверяем.
   */
  const clientHint = (): { tone: 'hint' | 'error'; text: string } | null => {
    if (amountRaw.trim().length === 0) return null;

    if (!valid) return { tone: 'error', text: COPY.withdraw.invalidAmount };
    if (amount < minAmount) {
      return { tone: 'hint', text: COPY.withdraw.minAmount(formatMoney(minAmount, currency)) };
    }
    if (amount > balance) return { tone: 'error', text: COPY.withdraw.amountAboveBalance };
    if (requisites.trim().length > 0 && requisites.trim().length < 5) {
      return { tone: 'error', text: COPY.withdraw.invalidRequisites };
    }
    return null;
  };

  const canSubmit =
    valid &&
    amount >= minAmount &&
    amount <= balance &&
    requisites.trim().length >= 5 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    haptic.medium();

    try {
      // Отправляем сумму В КОПЕЙКАХ и реквизиты. Баланс backend считает сам.
      await createWithdrawal({ amount, requisites: requisites.trim() });
      toast.success('Заявка на вывод создана');
      setAmountRaw('');
      setRequisites('');
      haptic.success();
      onDone();
    } catch (e) {
      // ApiError.message уже безопасен для показа пользователю.
      const message = e instanceof Error ? e.message : COPY.errors.generic;
      setError(message);
      haptic.error();
    } finally {
      setSubmitting(false);
    }
  };

  const hint = clientHint();

  return (
    <Modal
      open={open}
      title="Вывод средств"
      onClose={onClose}
      footer={
        <Button onClick={() => void handleSubmit()} disabled={!canSubmit} loading={submitting}>
          Создать заявку
        </Button>
      }
    >
      <div className="stack stack-3">
        {/* Баланс берём из ответа backend. */}
        <div className="card card--tight card--flat" style={{ background: 'var(--c-primary-50)' }}>
          <div className="row-flex row-flex--between">
            <span className="t-sm t-muted">Доступно к выводу</span>
            <span className="t-h3" style={{ color: 'var(--c-primary-dark)' }}>
              {formatMoney(balance, currency)}
            </span>
          </div>
        </div>

        {balance === 0 && (
          <div className="card card--tight" style={{ borderColor: 'var(--c-warning)' }}>
            <p className="t-sm">
              На балансе пока нет средств. Пригласите друзей, чтобы заработать бонус.
            </p>
          </div>
        )}

        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">Сумма</span>
          <div className="input-wrap">
            <span className="input-wrap__cur">₽</span>
            <input
              className="input input--amount"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={amountRaw}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d\s]/g, '');
                setAmountRaw(next);
                setError(null);
              }}
              aria-invalid={Boolean(hint && hint.tone === 'error')}
            />
          </div>
          {hint ? (
            <span className={hint.tone === 'error' ? 'field__error' : 'field__hint'}>{hint.text}</span>
          ) : (
            <span className="field__hint">
              Минимальная сумма — {formatMoney(minAmount, currency)}
            </span>
          )}
        </label>

        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field__label">Реквизиты</span>
          <textarea
            className="input"
            rows={3}
            autoComplete="off"
            placeholder="Номер карты, кошелёка или реквизиты для перевода"
            value={requisites}
            onChange={(e) => {
              setRequisites(e.target.value);
              setError(null);
            }}
            style={{ resize: 'none', height: 'auto', minHeight: 96, lineHeight: 1.45 }}
            aria-invalid={requisites.length > 0 && requisites.trim().length < 5}
          />
          <span className="field__hint">
            Проверьте данные внимательно: перевод на неверные реквизиты вернуть сложно.
          </span>
        </label>

        {error && (
          <div className="card card--tight" style={{ borderColor: 'var(--c-danger)' }}>
            <div className="row-flex" style={{ alignItems: 'flex-start' }}>
              <Icon name="alert" size={18} style={{ color: 'var(--c-danger)' }} />
              <span className="t-sm grow">{error}</span>
            </div>
          </div>
        )}

        <p className="t-xs t-muted" style={{ lineHeight: 1.5 }}>
          Заявка обрабатывается вручную. Срок вывода — обычно до 24 часов.
          Итоговую сумму и комиссию рассчитывает сервис.
        </p>
      </div>
    </Modal>
  );
}