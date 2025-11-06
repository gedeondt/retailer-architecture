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

  function resolveChannel(container) {
    const provided = container?.dataset?.channel;
    if (provided && provided.trim() !== '') {
      return provided.trim();
    }
    return 'general';
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

  function formatThroughput(value) {
    const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return `${numeric.toFixed(2)} evt/s`;
  }

  function useOverviewLoader(apiBase, initialChannel) {
    const [channel, setChannel] = useState(() => initialChannel);
    const [state, setState] = useState({ status: 'loading', error: null, overview: null });
    const loadRef = useRef(() => {});

    const fetchOverview = useMemo(() => {
      return async (targetChannel) => {
        const url = new URL('/overview', apiBase);
        if (typeof targetChannel === 'string' && targetChannel.trim().length > 0) {
          url.searchParams.set('channel', targetChannel.trim());
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('No se pudo recuperar el estado del bus de eventos');
        }
        return response.json();
      };
    }, [apiBase]);

    useEffect(() => {
      let cancelled = false;

      const load = async (requestedChannel) => {
        const normalizedChannel =
          typeof requestedChannel === 'string' && requestedChannel.trim().length > 0
            ? requestedChannel.trim()
            : '';

        setState((previous) => ({ ...previous, status: 'loading', error: null }));
        try {
          const overview = await fetchOverview(normalizedChannel);
          if (!cancelled) {
            const resolvedChannel =
              typeof overview.channel === 'string' && overview.channel.trim().length > 0
                ? overview.channel.trim()
                : normalizedChannel;
            if (resolvedChannel && resolvedChannel !== channel) {
              setChannel(resolvedChannel);
            }
            setState({ status: 'ready', error: null, overview });
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            setState({ status: 'error', error: message, overview: null });
          }
        }
      };

      const trigger = () => load(channel);
      loadRef.current = trigger;
      trigger();

      const intervalId = setInterval(trigger, REFRESH_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(intervalId);
      };
    }, [channel, fetchOverview]);

    return {
      state,
      channel,
      setChannel,
      reload: () => loadRef.current?.(),
    };
  }

  function WidgetHeader({ status, totalChannels, totalStoredEvents, onReload }) {
    const isLoading = status === 'loading';
    const statusLabel =
      status === 'error' ? 'Error de comunicación' : isLoading ? 'Sincronizando…' : 'Actualizado';
    const channelsLabel =
      totalChannels === 1 ? '1 canal disponible' : `${totalChannels} canales disponibles`;
    const eventsLabel =
      totalStoredEvents === 1
        ? '1 evento almacenado'
        : `${totalStoredEvents} eventos almacenados`;
    return (
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Event Bus</h1>
          <p className="text-sm text-slate-300">
            Resumen de eventos publicados, canales disponibles y el avance de los consumidores registrados.
          </p>
          <p className="text-xs text-slate-500 mt-2">{channelsLabel} · {eventsLabel}</p>
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

    const totalChannels = overview.totalChannels ?? overview.channels?.length ?? 0;
    const totalStoredEvents =
      overview.totalStoredEvents ??
      (overview.channels
        ? overview.channels.reduce((sum, channel) => sum + (channel.totalEvents ?? 0), 0)
        : overview.totalEvents ?? 0);
    const channelThroughput = overview.channelThroughput ?? 0;
    const channelName = overview.channel ?? 'Sin canales';
    const consumers = overview.consumers ?? [];
    const totalEvents = overview.totalEvents ?? 0;
    const highWatermark = overview.highWatermark ?? 0;
    const lastEvent = overview.lastEvent ?? null;

    const committedOffsets = consumers.reduce((sum, consumer) => sum + (consumer.offset ?? 0), 0);
    const averageOffset = consumers.length ? Math.round(committedOffsets / consumers.length) : 0;
    const lastEventCaption = lastEvent
      ? `Registrado ${formatTimestamp(lastEvent.timestamp)}`
      : 'Sin eventos registrados';

    return (
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Canales registrados"
          value={totalChannels}
          caption={`${totalStoredEvents} eventos almacenados`}
        />
        <StatCard
          label="Canal activo"
          value={channelName}
          caption={`${consumers.length} consumidores · Offset medio ${averageOffset}`}
        />
        <StatCard
          label="Eventos en el canal"
          value={totalEvents}
          caption={`ID máximo ${highWatermark}`}
        />
        <StatCard
          label="Throughput (10s)"
          value={formatThroughput(channelThroughput)}
          caption={lastEvent ? `Último: ${formatEventType(lastEvent.type)}` : lastEventCaption}
        />
      </section>
    );
  }

  function EmptyState({ message }) {
    return <p className="text-sm text-slate-400 text-center py-6">{message}</p>;
  }

  function ChannelList({ channels, activeChannel, onSelect }) {
    if (!channels || channels.length === 0) {
      return <EmptyState message="Todavía no hay canales registrados." />;
    }

    return (
      <ul className="space-y-2">
        {channels.map((channel) => {
          const isActive = channel.name === activeChannel;
          const throughputValue = channel.throughput ?? 0;
          const lastEventDescription = channel.lastEventType
            ? `${formatEventType(channel.lastEventType)} · ${formatTimestamp(channel.lastEventTimestamp)}`
            : 'Sin eventos registrados';

          return (
            <li key={channel.name}>
              <button
                type="button"
                onClick={() => onSelect?.(channel.name)}
                className={classNames(
                  'w-full text-left rounded-lg border px-4 py-3 transition-colors',
                  isActive
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-100'
                    : 'border-slate-700 bg-slate-900/40 text-slate-200 hover:bg-slate-900/70',
                )}
                aria-pressed={isActive ? 'true' : 'false'}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-inherit">{channel.name}</p>
                    <p
                      className={classNames(
                        'text-xs',
                        isActive ? 'text-emerald-200/80' : 'text-slate-400',
                      )}
                    >
                      {channel.totalEvents} eventos · {lastEventDescription}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Throughput (10s)
                    </p>
                    <p className="text-sm font-semibold text-slate-100">
                      {formatThroughput(throughputValue)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
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
    const initialChannel = useMemo(() => resolveChannel(container), [container]);
    const {
      state,
      reload,
      channel: selectedChannel,
      setChannel: setSelectedChannel,
    } = useOverviewLoader(apiBase, initialChannel);

    const overview = state.overview;
    const channels = overview?.channels ?? [];
    const totalChannels = overview?.totalChannels ?? channels.length;
    const totalStoredEvents =
      overview?.totalStoredEvents ??
      channels.reduce((sum, channel) => sum + (channel.totalEvents ?? 0), 0);
    const recentEvents = overview?.recentEvents ?? [];
    const consumers = overview?.consumers ?? [];
    const highWatermark = overview?.highWatermark ?? 0;
    const activeChannelName = overview?.channel ?? selectedChannel ?? initialChannel;

    return (
      <div className="space-y-6">
        <WidgetHeader
          status={state.status}
          totalChannels={totalChannels}
          totalStoredEvents={totalStoredEvents}
          onReload={reload}
        />
        <ErrorMessage message={state.error} />
        <StatsPanel overview={overview} />
        <section className="space-y-3">
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Canales registrados</h2>
            <p className="text-xs text-slate-500">
              Selecciona un canal para explorar sus eventos y consumidores.
            </p>
          </div>
          <ChannelList
            channels={channels}
            activeChannel={overview?.channel ?? selectedChannel ?? null}
            onSelect={setSelectedChannel}
          />
        </section>
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <article className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Eventos recientes</h2>
              <p className="text-xs text-slate-500">Canal {activeChannelName ?? '—'}</p>
            </div>
            <RecentEvents events={recentEvents} />
          </article>
          <article className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Consumidores</h2>
              <p className="text-xs text-slate-500">Canal {activeChannelName ?? '—'}</p>
            </div>
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
