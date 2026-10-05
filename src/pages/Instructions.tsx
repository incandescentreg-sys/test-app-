/**
 * Экран «Как подключить VPN?» (ТЗ п. 11).
 *
 * ВСЁ содержимое берётся из `src/config/app.ts`
 * (INSTRUCTION_STEPS, VPN_APPS) — чтобы заменить инструкции
 * или добавить своё приложение, править UI не нужно.
 */

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Header } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { AppLinks, FaqList, Section, Steps } from '@/components/Layout';
import { APP_CONFIG, INSTRUCTION_STEPS, VPN_APPS } from '@/config/app';
import { useRouter } from '@/lib/router';
import { haptic, openLink } from '@/lib/telegram';

export default function InstructionsPage() {
  const { back, canGoBack } = useRouter();

  return (
    <>
      <Header
        title="Как подключить VPN?"
        subtitle={`${INSTRUCTION_STEPS.length} простых шагов`}
        onBack={canGoBack ? back : null}
      />

      <div className="screen screen--plain">
        <Card appear>
          <Steps />
        </Card>

        <Section title="Приложения">
          <p className="t-sm t-muted mb-3" style={{ lineHeight: 1.5 }}>
            Выберите любое поддерживаемое приложение. Универсальный вариант — Happ:
            он работает на iOS, Android, macOS и Windows.
          </p>
          <AppLinks
            apps={VPN_APPS}
            onOpen={(url) => {
              haptic.light();
              openLink(url);
            }}
          />
        </Section>

        <Section title="Частые вопросы">
          <FaqList />
        </Section>

        <div className="stack stack-3 mt-5">
          <Button
            variant="secondary"
            onClick={() => {
              haptic.medium();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            icon={<Icon name="refresh" size={17} />}
          >
            Повторить с начала
          </Button>

          {APP_CONFIG.support.url && (
            <Button
              variant="ghost"
              onClick={() => {
                haptic.light();
                openLink(APP_CONFIG.support.url);
              }}
              icon={<Icon name="telegram" size={18} />}
            >
              Не получилось — в поддержку
            </Button>
          )}
        </div>
      </div>
    </>
  );
}