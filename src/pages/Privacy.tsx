/**
 * Политика конфиденциальности.
 *
 * Если в проекте задан VITE_PRIVACY_URL, пользователь будет отправлен
 * на полноценный документ на сайте. Этот экран — короткая справка
 * о том, что именно мы собираем и как защищаем.
 */

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Section } from '@/components/Layout';
import { APP_CONFIG } from '@/config/app';
import { useRouter } from '@/lib/router';
import { formatDateLong } from '@/lib/format';
import { openLink } from '@/lib/telegram';

export default function PrivacyPage() {
  const { back, canGoBack } = useRouter();

  const lastUpdated = APP_CONFIG.privacyUrl
    ? null
    : formatDateLong(new Date().toISOString());

  return (
    <>
      <Header title="Конфиденциальность" subtitle="Как мы обращаемся с данными" onBack={canGoBack ? back : null} />

      <div className="screen screen--plain">
        {lastUpdated && (
          <p className="t-xs t-muted mb-4">Последнее обновление: {lastUpdated}</p>
        )}

        <Card tone="blue" appear>
          <div className="row-flex" style={{ alignItems: 'flex-start' }}>
            <Icon name="shield" size={22} style={{ color: 'var(--c-primary-dark)', flex: '0 0 auto' }} />
            <p className="t-sm grow" style={{ lineHeight: 1.5 }}>
              Мы не просим пароль и не собираем данные банковской карты. Оплата проходит
              на стороне платёжного провайдера — приложение получает только факт успешного платежа.
            </p>
          </div>
        </Card>

        <Section title="Какие данные мы получаем">
          <div className="rows">
            <Item
              icon="user"
              title="Данные Telegram"
              text="Идентификатор, имя и username — из Telegram при открытии приложения. Используются только для идентификации аккаунта."
            />
            <Item
              icon="card"
              title="Данные подписки"
              text="Тариф, даты начала и окончания, статус оплаты. Номера и данные ваших карт мы не получаем."
            />
            <Item
              icon="wallet"
              title="Реферальные данные"
              text="Кто вас пригласил и суммы начислений — только для расчёта бонусов и выплат."
            />
          </div>
        </Section>

        <Section title="Чего мы не делаем">
          <Card>
            <ul className="stack stack-3 t-sm" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.5 }}>
              <li>Не показываем рекламу и не продаём ваши данные третьим лицам.</li>
              <li>Не храним вашу VPN-конфигурацию на своих серверах.</li>
              <li>Не логируем содержимое вашего трафика — мы не видите, что вы делаете в интернете.</li>
              <li>Не требуем пароль от Telegram или банковской карты.</li>
            </ul>
          </Card>
        </Section>

        <Section title="Хранение VPN-конфигурации">
          <Card>
            <p className="t-sm" style={{ lineHeight: 1.5 }}>
              Конфигурация выдаётся вам напрямую и хранится только на вашем устройстве.
              В приложении она находится в оперативной памяти и не попадает ни в историю
              браузера, ни в локальное хранилище. После выхода с экрана ссылка удаляется.
            </p>
          </Card>
        </Section>

        <Section title="Ваши права">
          <Card>
            <p className="t-sm" style={{ lineHeight: 1.5 }}>
              Вы можете запросить удаление аккаунта и всех связанных с ним данных.
              Напишите в поддержку с вашим Telegram ID — мы обработаем запрос.
            </p>
          </Card>
        </Section>

        <div className="stack stack-3 mt-5">
          {APP_CONFIG.support.username && (
            <Button
              variant="secondary"
              onClick={() => openLink(`https://t.me/${APP_CONFIG.support.username}`)}
              icon={<Icon name="telegram" size={18} />}
            >
              Вопросы? Напишите нам
            </Button>
          )}

          {APP_CONFIG.privacyUrl && (
            <Button
              variant="ghost"
              onClick={() => openLink(APP_CONFIG.privacyUrl)}
              icon={<Icon name="external" size={18} />}
            >
              Полный документ
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Item({
  icon,
  title,
  text,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  text: string;
}) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <span className="row__icon">
        <Icon name={icon} size={17} />
      </span>
      <span className="row__body">
        <span className="row__title">{title}</span>
        <span
          className="row__sub"
          style={{ whiteSpace: 'normal', lineHeight: 1.45, marginTop: 3 }}
        >
          {text}
        </span>
      </span>
    </div>
  );
}