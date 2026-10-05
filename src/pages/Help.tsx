/**
 * Экран «Помощь» — FAQ + быстрый доступ к инструкции и поддержке.
 */

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { FaqList, Section } from '@/components/Layout';
import { APP_CONFIG } from '@/config/app';
import { useRouter } from '@/lib/router';
import { haptic, openLink } from '@/lib/telegram';

export default function HelpPage() {
  const { back, canGoBack, navigate, reset } = useRouter();

  return (
    <>
      <Header title="Помощь" subtitle="Ответы и поддержка" onBack={canGoBack ? back : null} />

      <div className="screen screen--plain">
        {/* ── Быстрые действия ───────────────────────────────────────── */}
        <div className="rows">
          <button
            type="button"
            className="row"
            onClick={() => navigate('instructions')}
          >
            <span className="row__icon">
              <Icon name="book" size={17} />
            </span>
            <span className="row__body">
              <span className="row__title">Инструкция по подключению</span>
              <span className="row__sub">4 шага для вашего устройства</span>
            </span>
            <span className="row__chevron">
              <Icon name="chevron-right" size={18} />
            </span>
          </button>

          {APP_CONFIG.support.username && (
            <button
              type="button"
              className="row"
              onClick={() => openLink(`https://t.me/${APP_CONFIG.support.username}`)}
            >
              <span className="row__icon">
                <Icon name="telegram" size={17} />
              </span>
              <span className="row__body">
                <span className="row__title">Написать в поддержку</span>
                <span className="row__sub">@{APP_CONFIG.support.username}</span>
              </span>
              <span className="row__chevron">
                <Icon name="chevron-right" size={18} />
              </span>
            </button>
          )}

          <button type="button" className="row" onClick={() => reset('subscription')}>
            <span className="row__icon">
              <Icon name="card" size={17} />
            </span>
            <span className="row__body">
              <span className="row__title">Вопросы по оплате</span>
              <span className="row__sub">Подписка, продление, сроки</span>
            </span>
            <span className="row__chevron">
              <Icon name="chevron-right" size={18} />
            </span>
          </button>
        </div>

        {/* ── Диагностика ────────────────────────────────────────────── */}
        <Section title="VPN не подключается">
          <Card tone="blue">
            <ol
              className="stack stack-3 t-sm"
              style={{ lineHeight: 1.5, paddingLeft: 18, margin: 0 }}
            >
              <li>Перезапустите VPN-приложение и включите его заново.</li>
              <li>Если есть выбор сервера — попробуйте другой.</li>
              <li>Проверьте, что системное время на устройстве выставлено автоматически.</li>
              <li>
                Переустановите конфигурацию: скопируйте её заново на экране «Ваш VPN».
              </li>
              <li>Не помогло — напишите в поддержку, приложим инструкцию по диагностике.</li>
            </ol>
          </Card>
        </Section>

        {/* ── FAQ ────────────────────────────────────────────────────── */}
        <Section title="Частые вопросы">
          <FaqList />
        </Section>

        {/* ── Поддержка ──────────────────────────────────────────────── */}
        <div className="stack stack-3 mt-5">
          {APP_CONFIG.support.url && (
            <Button
              onClick={() => {
                haptic.medium();
                openLink(APP_CONFIG.support.url);
              }}
              icon={<Icon name="telegram" size={18} />}
            >
              Написать в поддержку
            </Button>
          )}

          <Button
            variant="ghost"
            onClick={() => navigate('privacy')}
            icon={<Icon name="shield" size={18} />}
          >
            Политика конфиденциальности
          </Button>
        </div>

        <p className="t-xs t-muted t-center mt-4">
          Ответы обычно приходят в течение 15 минут.
        </p>
      </div>
    </>
  );
}