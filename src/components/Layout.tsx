import { FAQ, FEATURES, INSTRUCTION_STEPS, type InstructionStep } from '@/config/app';
import { Card } from './Card';
import { Icon } from './Icon';

/* ── Шаги инструкции (ТЗ п. 11) ───────────────────────────────────────── */

export function Steps({ items = INSTRUCTION_STEPS }: { items?: InstructionStep[] }) {
  return (
    <div className="steps">
      {items.map((step, i) => (
        <div className="step" key={step.id}>
          <div className="step__num" aria-hidden="true">
            {i + 1}
          </div>
          <div className="step__body">
            <h3 className="step__title">{step.title}</h3>
            <p className="step__text">{step.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Плитки преимуществ (ТЗ п. 4) ─────────────────────────────────────── */

export function FeatureGrid() {
  return (
    <div className="feats">
      {FEATURES.map((f) => (
        <div className="feat" key={f.icon}>
          <span className="feat__ico" aria-hidden="true">
            <Icon name={f.icon} size={17} />
          </span>
          <span className="feat__txt">{f.title}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Список приложений для инструкции ──────────────────────────────────── */

interface AppLink {
  id: string;
  name: string;
  note: string;
  storeUrl: string | null;
  emoji: string;
}

export function AppLinks({
  apps,
  onOpen,
}: {
  apps: readonly AppLink[];
  onOpen: (url: string) => void;
}) {
  if (apps.length === 0) return null;

  return (
    <div className="rows">
      {apps.map((app) => (
        <button
          key={app.id}
          type="button"
          className="row"
          onClick={() => {
            if (app.storeUrl) onOpen(app.storeUrl);
          }}
          disabled={!app.storeUrl}
        >
          <span className="row__icon" style={{ fontSize: 17 }} aria-hidden="true">
            {app.emoji}
          </span>
          <span className="row__body">
            <span className="row__title">{app.name}</span>
            <span className="row__sub">{app.note}</span>
          </span>
          {app.storeUrl && (
            <span className="row__chevron">
              <Icon name="external" size={17} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────── */

export function FaqList({ items = FAQ }: { items?: typeof FAQ }) {
  return (
    <div className="stack stack-2">
      {items.map((item) => (
        <details key={item.q} className="card card--tight">
          <summary
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              listStyle: 'none',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            <span className="grow">{item.q}</span>
            <Icon name="chevron-down" size={18} style={{ color: 'var(--c-primary-300)' }} />
          </summary>
          <p className="t-sm t-muted" style={{ marginTop: 10, lineHeight: 1.5 }}>
            {item.a}
          </p>
        </details>
      ))}
    </div>
  );
}

/* ── Секция с заголовком ──────────────────────────────────────────────── */

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      {(title || action) && (
        <div className="row-flex row-flex--between mb-3">
          {title && <h2 className="t-h3">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Карточка со списком «ключ — значение». */
export function DefinitionList({
  items,
}: {
  items: Array<{ k: string; v: React.ReactNode }>;
}) {
  return (
    <Card>
      <div className="dl">
        {items.map((item) => (
          <div className="dl__item" key={item.k}>
            <span className="dl__k">{item.k}</span>
            <span className="dl__v">{item.v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}