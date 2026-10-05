import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/lib/logger';
import { haptic } from '@/lib/telegram';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Граница ошибок.
 *
 * Пользователь НИКОГДА не должен увидеть стектрейс, JSON или технические
 * детали (ТЗ п. 20) — поэтому здесь просто понятное сообщение и кнопка
 * «Перезагрузить». Подробности уходят в маскированные логи.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('boundary', { message: error.message, componentStack: info.componentStack });
    haptic.error();
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app">
        <div className="screen screen--plain">
          <div className="state state--error">
            <div className="state__ico">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0" />
              </svg>
            </div>
            <h2 className="state__title">Что-то пошло не так</h2>
            <p className="state__text">Приложение столкнулось с ошибкой. Попробуйте перезагрузить его.</p>
            <button
              type="button"
              className="btn btn--secondary btn--inline state__action"
              onClick={this.handleReset}
            >
              Перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}