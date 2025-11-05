(() => {
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    throw new Error('El widget del Event Bus requiere que React y ReactDOM estén disponibles.');
  }

  const { useEffect, useMemo, useRef, useState } = React;
  const { createRoot } = ReactDOM;

  const REFRESH_INTERVAL_MS = 15_000;
  const MAX_RECENT_EVENTS = 10;

  function classNames(...values) {
    return values.filter(Boolean).join(' ');
  }

  function resolveApiBase(container) {
    const provided = container?.dataset?.apiOrigin;
    if (provided && provided.trim() !== '') {
      return provided;
    }
    return window.location.origin;
  }

  function formatTimestamp(isoString) {
    if (!isoString) {
      return '—';
    }
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function formatEventType(type) {
    if (typeof type !== 'string' || type.trim() === '') {
      return 'evento.sin_tipo';
    }
    return type;
  }

  function useOverviewLoader(apiBase) {
    const [state, setState] = useState({ status: 'loading', error: null, overview: null });
    const loadRef = useRef(() => {});

    const fetchOverview = useMemo(() => {
      return async () => {
        const response = await fetch(new URL('/overview', apiBase));
        if (!response.ok) {
          throw new Error('No se pudo recuperar el estado del bus de eventos');
        }
        return response.json();
      };
    }, [apiBase]);

    useEffect(() => {
      let cancelled = false;

      const load = async () => {
        setState((previous) => ({ ...previous, status: 'loading', error: null }));
        try {
          const overview = await fetchOverview();
          if (!cancelled) {
            setState({ status: 'ready', error: null, overview });
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            setState({ status: 'error', error: message, overview: null });
          }
        }
      };

      loadRef.current = load;
      load();

      const intervalId = setInterval(load, REFRESH_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(intervalId);
      };
    }, [fetchOverview]);

    return {
      state,
      reload: () => loadRef.current?.(),
    };
  }

  function WidgetHeader({ status, totalEvents, onReload }) {
    const isLoading = status === 'loading';
    const statusLabel =
      status === 'error' ? 'Error de comunicación' : isLoading ? 'Sincronizando…' : 'Actualizado';
    return (
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Bus</h1>
          <p className="text-sm text-slate-300">
            Resumen de eventos publicados y el avance de los consumidores registrados.
          </p>
          <p className="text-xs text-slate-500 mt-2">{totalEvents} eventos registrados</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={classNames(
              'text-xs font-medium px-3 py-1 rounded-full border',
              status === 'error'
                ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
                : 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
            )}
          >
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={onReload}
            disabled={isLoading}
            className={classNames(
              'px-3 py-1 text-sm font-medium rounded-lg transition-colors border border-slate-600 bg-slate-700 hover:bg-slate-600',
              isLoading && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isLoading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>
    );
  }

  function StatCard({ label, value, caption }) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-1">
        <p className="text-sm uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-2xl font-semibold text-slate-100">{value}</p>
        {caption ? <p className="text-xs text-slate-500">{caption}</p> : null}
      </div>
    );
  }

  function StatsPanel({ overview }) {
    if (!overview) {
      return null;
    }

    const { totalEvents, highWatermark, consumers, lastEvent } = overview;
    const committedOffsets = consumers.reduce((sum, consumer) => sum + (consumer.offset ?? 0), 0);
    const averageOffset = consumers.length ? Math.round(committedOffsets / consumers.length) : 0;

    return (
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Eventos totales" value={totalEvents} caption={`ID máximo ${highWatermark}`} />
        <StatCard
          label="Consumidores registrados"
          value={consumers.length}
          caption={`Offset medio ${averageOffset}`}
        />
        <StatCard
          label="Último evento"
          value={lastEvent ? formatEventType(lastEvent.type) : 'Sin eventos'}
          caption={lastEvent ? formatTimestamp(lastEvent.timestamp) : undefined}
        />
      </section>
    );
  }

  function EmptyState({ message }) {
    return <p className="text-sm text-slate-400 text-center py-6">{message}</p>;
  }

  function RecentEvents({ events }) {
    if (!events || events.length === 0) {
      return <EmptyState message="Todavía no se han publicado eventos." />;
    }

    return (
      <ul className="space-y-3">
        {events.slice(0, MAX_RECENT_EVENTS).map((event) => (
          <li key={event.id} className="border border-slate-700 rounded-lg p-3 bg-slate-900/40">
            <p className="text-sm font-semibold text-slate-100">
              #{event.id} · {formatEventType(event.type)}
            </p>
            <p className="text-xs text-slate-400 mt-1">{formatTimestamp(event.timestamp)}</p>
            <pre className="mt-2 text-xs bg-slate-950/60 rounded p-3 overflow-x-auto text-slate-300">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    );
  }

  function ConsumersTable({ consumers, highWatermark }) {
    if (!consumers || consumers.length === 0) {
      return <EmptyState message="Aún no se han registrado consumidores." />;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400 uppercase text-xs tracking-wide">
              <th className="py-2 pr-4">Consumidor</th>
              <th className="py-2 pr-4">Offset</th>
              <th className="py-2 pr-4">Pendientes</th>
              <th className="py-2 pr-4">Actualizado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {consumers.map((consumer) => {
              const pending = Math.max(0, (highWatermark ?? 0) - (consumer.offset ?? 0));
              return (
                <tr key={consumer.name} className="text-slate-200">
                  <td className="py-2 pr-4 font-medium">{consumer.name}</td>
                  <td className="py-2 pr-4">{consumer.offset ?? 0}</td>
                  <td className="py-2 pr-4">{pending}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {consumer.updatedAt ? formatTimestamp(consumer.updatedAt) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function ErrorMessage({ message }) {
    if (!message) {
      return null;
    }
    return (
      <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
        {message}
      </div>
    );
  }

  function EventBusWidget({ container }) {
    const apiBase = useMemo(() => resolveApiBase(container), [container]);
    const { state, reload } = useOverviewLoader(apiBase);

    const overview = state.overview;
    const totalEvents = overview?.totalEvents ?? 0;
    const recentEvents = overview?.recentEvents ?? [];
    const consumers = overview?.consumers ?? [];
    const highWatermark = overview?.highWatermark ?? 0;

    return (
      <div className="space-y-6">
        <WidgetHeader status={state.status} totalEvents={totalEvents} onReload={reload} />
        <ErrorMessage message={state.error} />
        <StatsPanel overview={overview} />
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <article className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Eventos recientes</h2>
            <RecentEvents events={recentEvents} />
          </article>
          <article className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-100">Consumidores</h2>
            <ConsumersTable consumers={consumers} highWatermark={highWatermark} />
          </article>
        </section>
      </div>
    );
  }

  const container = document.getElementById('event-bus-root');
  if (!container) {
    throw new Error('No se encontró el contenedor del widget del Event Bus');
  }

  const root = createRoot(container);
  root.render(<EventBusWidget container={container} />);
})();
