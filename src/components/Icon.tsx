/**
 * Иконки — инлайновые SVG, 24×24, обводка currentColor.
 *
 * Своя реализация вместо библиотеки: нужен всего ~21 глиф, а
 * lucide-react добавил бы ~15 КБ в бандл ради них (ТЗ п. 33).
 * Атрибут `aria-hidden` — иконки всегда декоративные, текст рядом.
 */

export type IconName =
  | 'home'
  | 'card'
  | 'users'
  | 'user'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'check'
  | 'check-circle'
  | 'copy'
  | 'alert'
  | 'info'
  | 'lock'
  | 'bolt'
  | 'globe'
  | 'devices'
  | 'book'
  | 'help'
  | 'share'
  | 'wallet'
  | 'refresh'
  | 'external'
  | 'logout'
  | 'gift'
  | 'clock'
  | 'shield'
  | 'server'
  | 'telegram'
  | 'plus'
  | 'x'
  | 'infinity'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'sparkle';

/** viewBox-патчи (feather-подобные, stroke-width 2, round caps). */
const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  card: 'M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5zM3 10.5h18M6.5 14.5h3',
  users:
    'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-1.5a4 4 0 0 0-3-3.87M16 3.6a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  check: 'M4 12.5l5.5 5.5L20 7',
  'check-circle': 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16v-4M12 8h.01',
  lock: 'M5 11h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1M8 11V7a4 4 0 1 1 8 0v4',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20',
  devices:
    'M5 16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2zM8 20h2M16 10h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1M5 20h9',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  share: 'M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M16 6l-4-4-4 4M12 2v14',
  wallet:
    'M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v4M3 6v12a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M21 14h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  gift: 'M20 12v9H4v-9M2 8h20v4H2zM12 21V8M12 8H7.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8M12 8h4.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6.5V12l3.5 2',
  shield: 'M12 22s8-4 8-10V5.5l-8-3.5-8 3.5V12c0 6 8 10 8 10M9.5 12l2 2 4-4',
  server:
    'M5 3h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1M5 14h14a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1M8 6.5h.01M8 17.5h.01',
  telegram: 'M22 3 2 10.5l6 2.5M22 3l-4.5 18-4-8M22 3 9.5 13.5M9.5 13.5 6 21l3.5-7.5',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  infinity: 'M12 12c-2-2.7-3.2-4-5-4a4 4 0 0 0 0 8c1.8 0 3-1.3 5-4 2 2.7 3.2 4 5 4a4 4 0 0 0 0-8c-1.8 0-3 1.3-5 4',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  'eye-off':
    'M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.4 5.3A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.4 4.2M6.2 6.5A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1',
  sparkle: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4zM18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Иконка-эмодзи-подобная, без обводки. */
  filled?: boolean;
}

export function Icon({
  name,
  size = 22,
  strokeWidth = 2,
  className,
  style,
  filled,
}: IconProps) {
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}