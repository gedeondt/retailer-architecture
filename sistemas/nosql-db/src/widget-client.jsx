const { useEffect, useMemo, useRef, useState } = React;
const { createRoot } = ReactDOM;

const REFRESH_INTERVAL_MS = 10_000;

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

function formatThroughput(value) {
  return `${value.toFixed(2)} req/s`;
}

function WidgetHeader({ onReload, isLoading, totalCollections }) {
  const subtitle = totalCollections === 1 ? '1 colección registrada' : `${totalCollections} colecciones registradas`;
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Colecciones NoSQL</h1>
        <p className="text-sm text-slate-300">
          Resumen de colecciones, tamaño y throughput en los últimos 10 segundos.
        </p>
        <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onReload}
        disabled={isLoading}
        className={classNames(
          'px-3 py-1 text-sm font-medium rounded-lg transition-colors border border-slate-600 bg-slate-700 hover:bg-slate-600',
          isLoading && 'opacity-60 cursor-not-allowed',
        )}
      >
        {isLoading ? 'Actualizando…' : 'Actualizar ahora'}
      </button>
    </div>
  );
}

function ErrorMessage({ message }) {
  return (
    <div className="text-sm text-rose-400 bg-rose-400/10 border border-rose-500/30 rounded-lg px-3 py-2 mb-4">
      {message}
    </div>
  );
}

function EmptyState() {
  return <div className="text-sm text-slate-300 py-8 text-center col-span-full">Todavía no hay colecciones registradas.</div>;
}

function CollectionCard({ collection }) {
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 space-y-3">
      <h2 className="text-lg font-semibold text-slate-100">{collection.name}</h2>
      <p className="text-xs uppercase tracking-wide text-slate-400">Índice: {collection.indexField}</p>
      <p className="text-sm text-slate-200">{collection.itemCount} elementos almacenados</p>
      <p className="text-xs text-slate-400">Throughput (10s): {formatThroughput(collection.throughput)}</p>
    </article>
  );
}

function CollectionsGrid({ collections }) {
  if (!collections.length) {
    return <EmptyState />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {collections.map((collection) => (
        <CollectionCard key={collection.name} collection={collection} />
      ))}
    </div>
  );
}

function resolveApiBase(container) {
  const provided = container?.dataset?.apiOrigin;
  if (provided && provided.trim() !== '') {
    return provided;
  }
  return window.location.origin;
}

function NosqlCollectionsWidget() {
  const [state, setState] = useState({ status: 'loading', error: null, collections: [] });
  const loadRef = useRef(() => {});
  const container = document.getElementById('nosql-db-root');
  const apiBase = useMemo(() => resolveApiBase(container), [container]);

  const makeUrl = useMemo(() => {
    return (path) => new URL(path, apiBase).toString();
  }, [apiBase]);

  const fetchCollections = useMemo(() => {
    return async () => {
      setState((previous) => ({ ...previous, status: 'loading', error: null }));
      const response = await fetch(makeUrl('/collections'));
      if (!response.ok) {
        throw new Error('No se pudo recuperar la información de colecciones');
      }
      const payload = await response.json();
      return payload.items ?? [];
    };
  }, [makeUrl]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const items = await fetchCollections();
        if (!cancelled) {
          setState({ status: 'ready', error: null, collections: items });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ status: 'error', error: error.message, collections: [] });
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
  }, [fetchCollections]);

  const totalCollections = state.collections.length;
  const isLoading = state.status === 'loading';

  return (
    <div>
      <WidgetHeader onReload={() => loadRef.current?.()} isLoading={isLoading} totalCollections={totalCollections} />
      {state.error ? <ErrorMessage message={state.error} /> : null}
      <CollectionsGrid collections={state.collections} />
    </div>
  );
}

const container = document.getElementById('nosql-db-root');
if (!container) {
  throw new Error('No se encontró el contenedor del widget NoSQL');
}

const root = createRoot(container);
root.render(<NosqlCollectionsWidget />);

