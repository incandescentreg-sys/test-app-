import { Icon, type IconName } from './Icon';

export type BadgeTone = 'active' | 'warn' | 'off' | 'info';

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Живая точка с пульсацией — для активного VPN. */
  pulse?: boolean;
  icon?: IconName;
}

export function StatusBadge({ label, tone = 'info', pulse = false, icon }: StatusBadgeProps) {
  const toneClass =
    tone === 'active' ? 'badge--active' : tone === 'warn' ? 'badge--warn' : tone === 'off' ? 'badge--off' : 'badge--info';

  return (
    <span className={`badge ${toneClass}`}>
      {icon ? (
        <Icon name={icon} size={13} strokeWidth={2.4} />
      ) : pulse ? (
        <span className="dot dot--live" />
      ) : (
        <span className={`dot ${tone === 'off' ? 'dot--muted' : tone === 'warn' ? 'dot--warn' : ''}`} />
      )}
      {label}
    </span>
  );
}

/** Информационная «таблетка» без точки. */
export function InfoChip({ children, icon }: { children: string; icon?: IconName }) {
  return (
    <span className="chip">
      {icon && <Icon name={icon} size={13} strokeWidth={2.2} />}
      {children}
    </span>
  );
}