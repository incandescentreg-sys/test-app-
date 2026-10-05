import { Icon, type IconName } from './Icon';
import { haptic } from '@/lib/telegram';
import { useRouter, type RouteName } from '@/lib/router';

interface Tab {
  route: RouteName;
  label: string;
  icon: IconName;
}

const TABS: Tab[] = [
  { route: 'home', label: 'Главная', icon: 'home' },
  { route: 'subscription', label: 'Подписка', icon: 'card' },
  { route: 'referrals', label: 'Рефералы', icon: 'users' },
  { route: 'profile', label: 'Профиль', icon: 'user' },
];

/**
 * Нижняя навигация (ТЗ п. 5).
 *
 * «Пузырьки»: плавающая капсула с блюром, внутри — округлые пилюли,
 * активная вкладка наполнена зелёным градиентом. Отступы от краёв, поэтому
 * панель «висит» над контентом и не выглядит полосой, приклеенной к низу.
 *
 * Тач-таргеты 48px, устойчиво разнесены по ширине — удобно большим пальцем.
 * Переход сбрасывает стек роутера (вкладка всегда «корневая»).
 */
export function BottomNavigation() {
  const { route, reset } = useRouter();
  const active = route.name;

  return (
    <nav className="nav" aria-label="Основная навигация">
      {TABS.map((tab) => {
        const isActive = active === tab.route;
        return (
          <button
            key={tab.route}
            type="button"
            className="nav__item"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              if (isActive) return;
              haptic.select();
              reset(tab.route);
            }}
          >
            <span className="nav__icon">
              <Icon name={tab.icon} size={24} strokeWidth={isActive ? 2.2 : 1.9} />
            </span>
            <span className="nav__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}