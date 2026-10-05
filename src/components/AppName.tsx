import { APP_CONFIG } from '@/config/app';

/**
 * Название приложения, где первое слово выводится зелёным градиентом.
 *
 * Текст берётся из APP_CONFIG.name и делится по первому пробелу, поэтому
 * переименование сервиса в конфиге не требует правок UI.
 */
export function AppName({ className = '' }: { className?: string }) {
  const name = APP_CONFIG.name.trim();
  const firstSpace = name.indexOf(' ');

  // Одно слово — градиентируем целиком.
  if (firstSpace === -1) {
    return <span className={className}>{name}</span>;
  }

  const first = name.slice(0, firstSpace);
  const rest = name.slice(firstSpace + 1);

  return (
    <span className={className}>
      <span className="grad-text">{first}</span> {rest}
    </span>
  );
}