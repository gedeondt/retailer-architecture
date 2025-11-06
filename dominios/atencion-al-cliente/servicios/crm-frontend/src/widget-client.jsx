(() => {
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    throw new Error('El widget CRM requiere React y ReactDOM disponibles en la página.');
  }

  const { useEffect, useMemo, useState } = React;
  const { createRoot } = ReactDOM;

  const ROOT_ID = 'atencionalcliente-crm-root';
  const DEFAULT_API_ORIGIN = 'http://127.0.0.1:4400';
  const DEFAULT_PAGE_SIZE = 6;

  function normalizeOrigin(value) {
    if (typeof value !== 'string') {
      return DEFAULT_API_ORIGIN;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      return DEFAULT_API_ORIGIN;
    }
    return trimmed.replace(/\/$/, '');
  }

  function getApiOrigin(container) {
    if (!container || typeof container !== 'object') {
      return DEFAULT_API_ORIGIN;
    }
    const dataset = container.dataset || {};
    return normalizeOrigin(dataset.apiOrigin);
  }

  function classNames(...values) {
    return values.filter(Boolean).join(' ');
  }

  function ensurePositiveInteger(value, fallback) {
    const numeric = Number.parseInt(value, 10);
    if (!Number.isFinite(numeric) || numeric < 1) {
      return fallback;
    }
    return numeric;
  }

  function useEntities(apiOrigin) {
    const [state, setState] = useState({ status: 'idle', items: [], error: null });

    useEffect(() => {
      let cancelled = false;
      const controller = new AbortController();

      setState({ status: 'loading', items: [], error: null });

      const url = new URL('/entities', apiOrigin);
      fetch(url, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`No se pudieron obtener las entidades (${response.status})`);
          }
          return response.json();
        })
        .then((payload) => {
          if (cancelled) {
            return;
          }
          const items = Array.isArray(payload.items) ? payload.items : [];
          setState({ status: 'loaded', items, error: null });
        })
        .catch((error) => {
          if (cancelled || controller.signal.aborted) {
            return;
          }
          setState({ status: 'error', items: [], error: error.message || 'Error desconocido' });
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [apiOrigin]);

    return {
      loading: state.status === 'loading',
      error: state.status === 'error' ? state.error : null,
      items: state.items,
    };
  }

  function useEntityListing(apiOrigin, entityId, page, pageSize) {
    const [state, setState] = useState({ status: 'idle', data: null, error: null });

    useEffect(() => {
      if (!entityId) {
        setState({ status: 'idle', data: null, error: null });
        return undefined;
      }

      let cancelled = false;
      const controller = new AbortController();

      setState((previous) => ({ status: 'loading', data: previous.data, error: null }));

      const safePage = ensurePositiveInteger(page, 1);
      const safePageSize = ensurePositiveInteger(pageSize, DEFAULT_PAGE_SIZE);
      const url = new URL(`/entities/${encodeURIComponent(entityId)}`, apiOrigin);
      url.searchParams.set('page', safePage);
      url.searchParams.set('pageSize', safePageSize);

      fetch(url, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`No se pudo obtener la entidad ${entityId} (${response.status})`);
          }
          return response.json();
        })
        .then((payload) => {
          if (cancelled) {
            return;
          }
          setState({ status: 'loaded', data: payload, error: null });
        })
        .catch((error) => {
          if (cancelled || controller.signal.aborted) {
            return;
          }
          setState({ status: 'error', data: null, error: error.message || 'Error desconocido' });
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [apiOrigin, entityId, page, pageSize]);

    return {
      loading: state.status === 'loading',
      error: state.status === 'error' ? state.error : null,
      data: state.data,
    };
  }

  function formatFieldValue(value) {
    if (value === null || value === undefined) {
      return '—';
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? '—' : trimmed;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toString() : '—';
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '—' : value.toISOString();
    }
    return String(value);
  }

  function EntitiesMenu({ entities, activeId, onSelect }) {
    if (!Array.isArray(entities) || entities.length === 0) {
      return null;
    }

    return (
      <nav className="flex flex-wrap gap-2 mt-4" aria-label="Entidades CRM">
        {entities.map((entity) => {
          const isActive = entity.id === activeId;
          return (
            <button
              key={entity.id}
              type="button"
              onClick={() => onSelect(entity.id)}
              className={classNames(
                'px-3 py-1.5 text-sm font-semibold rounded-full border transition-colors',
                isActive
                  ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:text-rose-600 hover:border-rose-400',
              )}
            >
              {entity.name}
            </button>
          );
        })}
      </nav>
    );
  }

  function Pagination({ page, totalPages, totalItems, onPrev, onNext, disabled }) {
    if (!totalPages || totalPages <= 1) {
      return (
        <div className="flex items-center justify-between text-xs text-slate-500 mt-4">
          <span>{totalItems === 0 ? 'Sin resultados' : `${totalItems} registros`}</span>
          <span>Página {page}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={disabled || page <= 1}
          className={classNames(
            'px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors',
            page > 1 && !disabled
              ? 'text-slate-600 border-slate-200 hover:border-rose-400 hover:text-rose-600'
              : 'text-slate-400 border-slate-200 cursor-not-allowed bg-slate-50',
          )}
        >
          Anterior
        </button>
        <div className="text-xs text-slate-500">
          <span className="font-semibold text-slate-600">{totalItems}</span> registros · Página {page} de{' '}
          {totalPages}
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || page >= totalPages}
          className={classNames(
            'px-3 py-1.5 text-sm font-semibold rounded-lg border transition-colors',
            page < totalPages && !disabled
              ? 'text-slate-600 border-slate-200 hover:border-rose-400 hover:text-rose-600'
              : 'text-slate-400 border-slate-200 cursor-not-allowed bg-slate-50',
          )}
        >
          Siguiente
        </button>
      </div>
    );
  }

  function EntityTable({ entity, listing, page, onPageChange }) {
    if (!entity) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Selecciona una entidad para visualizar sus datos.
        </div>
      );
    }

    if (listing.error) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-lg text-sm text-center">
            No se pudo cargar la entidad. {listing.error}
          </div>
        </div>
      );
    }

    const fields = Array.isArray(entity.fields) ? entity.fields : [];
    const items = listing.data?.items || [];
    const totalPages = listing.data?.totalPages || 0;
    const totalItems = listing.data?.totalItems || 0;

    if (listing.loading && (!listing.data || !Array.isArray(listing.data.items))) {
      return (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          Cargando registros…
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-sm text-slate-500">
          <p>No hay registros disponibles para esta entidad.</p>
          <p className="text-xs mt-2 text-slate-400">Intenta sincronizar el backend del CRM y vuelve a consultar.</p>
        </div>
      );
    }

    const handlePrev = () => {
      if (page > 1) {
        onPageChange(page - 1);
      }
    };

    const handleNext = () => {
      if (totalPages && page < totalPages) {
        onPageChange(page + 1);
      }
    };

    return (
      <div className="flex-1 flex flex-col">
        <div className="overflow-auto -mx-6 px-6">
          <table className="min-w-full border-separate" style={{ borderSpacing: '0 8px' }}>
            <thead>
              <tr>
                {fields.map((field) => (
                  <th
                    key={field.key}
                    scope="col"
                    className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 px-4 py-2"
                  >
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item.__rowKey} className="bg-slate-50/60 text-sm text-slate-700">
                  {fields.map((field) => (
                    <td key={field.key} className="px-4 py-3 border-t border-slate-100">
                      {formatFieldValue(item[field.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPrev={handlePrev}
          onNext={handleNext}
          disabled={listing.loading}
        />
      </div>
    );
  }

  function CrmWidget({ apiOrigin }) {
    const entitiesState = useEntities(apiOrigin);
    const [activeId, setActiveId] = useState(null);
    const [pageByEntity, setPageByEntity] = useState({});

    useEffect(() => {
      if (entitiesState.items.length === 0) {
        setActiveId(null);
        return;
      }

      setActiveId((current) => {
        if (current && entitiesState.items.some((entity) => entity.id === current)) {
          return current;
        }
        return entitiesState.items[0]?.id || null;
      });
    }, [entitiesState.items]);

    useEffect(() => {
      if (!activeId) {
        return;
      }
      setPageByEntity((previous) => ({
        ...previous,
        [activeId]: previous[activeId] ?? 1,
      }));
    }, [activeId]);

    const activeEntity = useMemo(
      () => entitiesState.items.find((entity) => entity.id === activeId) || null,
      [entitiesState.items, activeId],
    );

    const activePage = pageByEntity[activeId] ?? 1;

    const listing = useEntityListing(apiOrigin, activeId, activePage, DEFAULT_PAGE_SIZE);

    const handleSelectEntity = (nextId) => {
      setActiveId(nextId);
    };

    const handlePageChange = (nextPage) => {
      setPageByEntity((previous) => ({
        ...previous,
        [activeId]: nextPage,
      }));
    };

    return (
      <div className="h-full flex flex-col">
        <header className="border-b border-slate-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">CRM de Atención al Cliente</h3>
              <p className="text-sm text-slate-500">
                Consulta entidades sincronizadas desde el backend del CRM y navega por sus registros.
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-rose-500 bg-rose-50 border border-rose-200 px-2 py-1 rounded-full">
              Demo conectada
            </span>
          </div>
          {entitiesState.loading && (
            <p className="text-xs text-slate-400 mt-4">Cargando entidades…</p>
          )}
          {entitiesState.error && (
            <p className="text-xs text-rose-500 mt-4">
              No se pudieron cargar las entidades. {entitiesState.error}
            </p>
          )}
          <EntitiesMenu entities={entitiesState.items} activeId={activeId} onSelect={handleSelectEntity} />
        </header>
        <main className="flex-1 px-6 py-4 flex flex-col">
          <EntityTable entity={activeEntity} listing={listing} page={activePage} onPageChange={handlePageChange} />
        </main>
      </div>
    );
  }

  const container = document.getElementById(ROOT_ID);
  if (!container) {
    return;
  }

  const apiOrigin = getApiOrigin(container);
  const root = createRoot(container);
  root.render(<CrmWidget apiOrigin={apiOrigin} />);
})();
