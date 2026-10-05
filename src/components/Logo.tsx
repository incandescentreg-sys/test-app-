import { APP_CONFIG } from '@/config/app';

/**
 * Логотип сервиса.
 *
 * Файл лежит в `public/logo.webp` — отдаётся как есть, без хеша,
 * поэтому его можно использовать и как иконку вкладки / PWA-иконку.
 *
 * Пока изображение грузится (или если оно недоступно) показываем
 * монограмму, чтобы не было «дырки» в шапке.
 */
export function Logo({
  size = 40,
  className = '',
  rounded = true,
}: {
  size?: number;
  className?: string;
  rounded?: boolean;
}) {
  const initial = APP_CONFIG.name.trim().charAt(0).toUpperCase() || 'V';

  return (
    <span
      className={`logo ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? '50%' : Math.round(size * 0.28),
      }}
    >
      <img
        src="/logo.webp"
        alt={APP_CONFIG.name}
        width={size}
        height={size}
        loading="eager"
        decoding="async"
        onError={(e) => {
          // Если картинка не загрузилась — показываем монограмму.
          const img = e.currentTarget;
          img.style.display = 'none';
          const sib = img.nextElementSibling as HTMLElement | null;
          if (sib) sib.style.display = 'grid';
        }}
      />
      {/* Монограмма-заглушка, видна только если картинка не загрузилась */}
      <span className="logo__fallback" aria-hidden="true" style={{ fontSize: size * 0.42 }}>
        {initial}
      </span>
    </span>
  );
}