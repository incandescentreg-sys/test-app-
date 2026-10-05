/**
 * Skeleton-компоненты (ТЗ п. 19).
 *
 * Правило: вместо пустого экрана показываем «форму» будущего контента,
 * чтобы вёрстка не прыгала после загрузки.
 */

export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`sk ${className}`} style={style} aria-hidden="true" />
  );
}

/** Карточка статуса VPN на главном экране. */
export function HomeSkeleton() {
  return (
    <div className="stack stack-3" role="status" aria-label="Загрузка">
      <Skeleton className="sk--hero" />
      <div className="feats">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="sk" style={{ height: 52 }} />
        ))}
      </div>
      <Skeleton className="sk--row" />
      <Skeleton className="sk--row" />
      <span className="sr-only">Загружаем данные…</span>
    </div>
  );
}

/** Список тарифов. */
export function PlansSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="plan-stack" role="status" aria-label="Загрузка тарифов">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="sk" style={{ height: 78, borderRadius: 20 }} />
      ))}
      <span className="sr-only">Загружаем тарифы…</span>
    </div>
  );
}

/** Карточка подписки. */
export function SubscriptionSkeleton() {
  return (
    <div className="stack stack-3" role="status" aria-label="Загрузка подписки">
      <Skeleton className="sk" style={{ height: 132, borderRadius: 20 }} />
      <Skeleton className="sk--row" />
      <Skeleton className="sk--row" />
      <span className="sr-only">Загружаем подписку…</span>
    </div>
  );
}

/** Строка списка. */
export function RowsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="stack stack-2" role="status" aria-label="Загрузка">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="sk--row" style={{ borderRadius: 16 }} />
      ))}
      <span className="sr-only">Загружаем данные…</span>
    </div>
  );
}

/** Профиль. */
export function ProfileSkeleton() {
  return (
    <div className="stack stack-3" role="status" aria-label="Загрузка профиля">
      <div className="card row-flex" style={{ gap: 14 }}>
        <Skeleton className="sk" style={{ width: 66, height: 66, borderRadius: 24 }} />
        <div className="grow stack stack-2">
          <Skeleton className="sk--line" style={{ width: '55%' }} />
          <Skeleton className="sk--line" style={{ width: '75%' }} />
        </div>
      </div>
      <Skeleton className="sk" style={{ height: 88, borderRadius: 20 }} />
      <Skeleton className="sk--row" />
      <Skeleton className="sk--row" />
      <span className="sr-only">Загружаем профиль…</span>
    </div>
  );
}

/** Рефералы. */
export function ReferralSkeleton() {
  return (
    <div className="stack stack-3" role="status" aria-label="Загрузка рефералов">
      <Skeleton className="sk" style={{ height: 108, borderRadius: 20 }} />
      <div className="row-flex">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} style={{ flex: 1, height: 76, borderRadius: 20 }} />
        ))}
      </div>
      <RowsSkeleton count={3} />
      <span className="sr-only">Загружаем рефералы…</span>
    </div>
  );
}

/** Конфигурация VPN. */
export function VpnConfigSkeleton() {
  return (
    <div className="stack stack-3" role="status" aria-label="Загрузка конфигурации">
      <Skeleton className="sk" style={{ height: 96, borderRadius: 20 }} />
      <Skeleton className="sk" style={{ height: 132, borderRadius: 20 }} />
      <Skeleton className="sk--row" style={{ height: 52 }} />
      <span className="sr-only">Загружаем конфигурацию…</span>
    </div>
  );
}