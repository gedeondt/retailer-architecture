(() => {
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    throw new Error('El widget de ecommerce requiere React y ReactDOM disponibles en la página.');
  }

  const { useMemo, useState } = React;
  const { createRoot } = ReactDOM;

  const PRODUCTS = [
    {
      sku: 'SKU-ACOUSTIC-01',
      name: 'Auriculares inalámbricos',
      description: 'Cancelación activa de ruido y batería de 30 horas.',
      price: 89.99,
    },
    {
      sku: 'SKU-SMARTWATCH-01',
      name: 'Smartwatch deportivo',
      description: 'Seguimiento de actividad, GPS y pagos sin contacto.',
      price: 149.5,
    },
    {
      sku: 'SKU-HOMEKIT-01',
      name: 'Kit hogar inteligente',
      description: 'Incluye hub, 2 sensores de puerta y bombilla Wi-Fi.',
      price: 119,
    },
    {
      sku: 'SKU-COFFEE-01',
      name: 'Cafetera espresso compacta',
      description: 'Presión profesional en un formato apto para cocinas pequeñas.',
      price: 75.25,
    },
  ];

  const DEFAULT_CURRENCY = 'EUR';
  const DEFAULT_API_ORIGIN = 'http://127.0.0.1:4300';

  const CARD_BRAND_PATTERNS = [
    { pattern: /^4/, brand: 'visa' },
    { pattern: /^5[1-5]/, brand: 'mastercard' },
    { pattern: /^3[47]/, brand: 'amex' },
    { pattern: /^6(?:011|5)/, brand: 'discover' },
  ];

  function formatCurrency(value, currency) {
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      }).format(value);
    } catch (_error) {
      return `${value.toFixed(2)} ${currency}`;
    }
  }

  function normalizeApiOrigin(value) {
    if (typeof value !== 'string') {
      return DEFAULT_API_ORIGIN;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_API_ORIGIN;
  }

  function getApiOrigin(container) {
    if (!container || typeof container !== 'object') {
      return DEFAULT_API_ORIGIN;
    }
    const dataset = container.dataset || {};
    return normalizeApiOrigin(dataset.apiOrigin);
  }

  function ensureTrailingSlash(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return '/';
    }
    return value.endsWith('/') ? value : `${value}/`;
  }

  function buildOrdersEndpoint(origin) {
    const baseWithSlash = ensureTrailingSlash(origin || DEFAULT_API_ORIGIN);
    try {
      const url = new URL('orders', baseWithSlash);
      return url.toString();
    } catch (_error) {
      return null;
    }
  }

  function normalizeString(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function sanitizeCardNumber(number) {
    const digits = typeof number === 'string' ? number.replace(/\D+/g, '') : '';
    if (!digits) {
      return { digits: '', last4: null };
    }
    return {
      digits,
      last4: digits.slice(-4),
    };
  }

  function detectCardBrand(digits) {
    if (!digits) {
      return null;
    }
    const found = CARD_BRAND_PATTERNS.find((entry) => entry.pattern.test(digits));
    return found ? found.brand : 'unknown';
  }

  function parseExpiry(value) {
    if (typeof value !== 'string') {
      return { month: null, year: null };
    }
    const match = value.trim().match(/^(\d{1,2})(?:\s*\/\s*(\d{2,4}))?$/);
    if (!match) {
      return { month: null, year: null };
    }

    let month = Number.parseInt(match[1], 10);
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      month = null;
    } else {
      month = String(month).padStart(2, '0');
    }

    let year = null;
    if (match[2]) {
      year = Number.parseInt(match[2], 10);
      if (Number.isFinite(year)) {
        if (year < 100) {
          year += 2000;
        }
        year = String(year);
      } else {
        year = null;
      }
    }

    return { month, year };
  }

  function clampQuantity(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return Math.max(0, Math.floor(parsed));
  }

  function useQuantities(products) {
    const [quantities, setQuantities] = useState(() => {
      return Object.fromEntries(products.map((product) => [product.sku, 0]));
    });

    const updateQuantity = (sku, value) => {
      setQuantities((previous) => ({
        ...previous,
        [sku]: clampQuantity(value),
      }));
    };

    return [quantities, updateQuantity];
  }

  function createDefaultFormData() {
    return {
      customerFirstName: 'Ana',
      customerLastName: 'Pérez',
      customerEmail: 'ana.perez@example.com',
      customerPhone: '+34 600 123 123',
      paymentCardHolder: 'Ana Pérez',
      paymentCardNumber: '4242 4242 4242 4242',
      paymentCardExpiry: '04/28',
      paymentCardCvv: '123',
      currency: DEFAULT_CURRENCY,
      confirmedAt: new Date().toISOString().slice(0, 16),
    };
  }

  function useCheckoutForm() {
    const [formData, setFormData] = useState(createDefaultFormData);

    const updateField = (name, value) => {
      setFormData((previous) => ({
        ...previous,
        [name]: value,
      }));
    };

    return [formData, updateField];
  }

  function buildItems(products, quantities) {
    return products
      .map((product) => ({
        sku: product.sku,
        name: product.name,
        price: product.price,
        quantity: quantities[product.sku] || 0,
      }))
      .filter((item) => item.quantity > 0);
  }

  function buildOrderEvent({ formData, items }) {
    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const confirmedAt = formData.confirmedAt;
    let isoConfirmedAt = null;

    if (confirmedAt) {
      const date = new Date(confirmedAt);
      if (!Number.isNaN(date.getTime())) {
        isoConfirmedAt = date.toISOString();
      }
    }

    const sanitizedCard = sanitizeCardNumber(formData.paymentCardNumber);
    const { month: expiryMonth, year: expiryYear } = parseExpiry(formData.paymentCardExpiry);
    const cardBrand = detectCardBrand(sanitizedCard.digits);
    const securityCodeProvided = Boolean(normalizeString(formData.paymentCardCvv));

    return {
      name: 'OrderConfirmed',
      payload: {
        customer: {
          firstName: normalizeString(formData.customerFirstName),
          lastName: normalizeString(formData.customerLastName),
          email: normalizeString(formData.customerEmail),
          phone: normalizeString(formData.customerPhone),
        },
        payment: {
          method: 'credit_card',
          card: {
            holderName: normalizeString(formData.paymentCardHolder),
            last4: sanitizedCard.last4,
            brand: cardBrand,
            expiryMonth,
            expiryYear,
          },
          securityCodeProvided,
        },
        items: items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
          price: Number(item.price.toFixed(2)),
        })),
        totalAmount: Number(totalAmount.toFixed(2)),
        currency: formData.currency || DEFAULT_CURRENCY,
        confirmedAt: isoConfirmedAt,
      },
    };
  }

  function ProductCard({ product, quantity, onChange, currency }) {
    return (
      <article className="border border-slate-200 rounded-lg p-4 bg-slate-50 shadow-sm space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">{product.name}</h4>
            <p className="text-xs text-slate-500">{product.sku}</p>
          </div>
          <span className="text-sm font-medium text-amber-600">
            {formatCurrency(product.price, currency)}
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{product.description}</p>
        <label className="block text-xs font-medium text-slate-700">
          Cantidad
          <input
            type="number"
            min="0"
            step="1"
            value={quantity}
            onChange={(event) => onChange(product.sku, event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
            aria-label={`Seleccionar cantidad para ${product.name}`}
          />
        </label>
      </article>
    );
  }

  function ProductsGrid({ products, quantities, onQuantityChange, currency }) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {products.map((product) => (
          <ProductCard
            key={product.sku}
            product={product}
            quantity={quantities[product.sku] || 0}
            onChange={onQuantityChange}
            currency={currency}
          />
        ))}
      </div>
    );
  }

  function Field({ label, id, children, description }) {
    return (
      <label className="block text-xs font-medium text-slate-700" htmlFor={id}>
        {label}
        {children}
        {description ? <span className="block mt-1 text-[11px] text-slate-500">{description}</span> : null}
      </label>
    );
  }

  function TextInput({
    id,
    value,
    onChange,
    placeholder,
    autoComplete,
    type = 'text',
    inputMode,
    maxLength,
    pattern,
  }) {
    return (
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        pattern={pattern}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
      />
    );
  }

  function DateInput({ id, value, onChange }) {
    return (
      <input
        id={id}
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
      />
    );
  }

  function CurrencySelect({ id, value, onChange }) {
    return (
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
      >
        <option value="EUR">EUR · Euro</option>
        <option value="USD">USD · Dólar estadounidense</option>
        <option value="GBP">GBP · Libra esterlina</option>
      </select>
    );
  }

  function OrderForm({ formData, onFieldChange }) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <header className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Cliente</h3>
            <p className="text-xs text-slate-500">
              Datos básicos para crear el cliente durante el checkout.
            </p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" id="customer-first-name" description="Nombre del titular de la cuenta.">
              <TextInput
                id="customer-first-name"
                value={formData.customerFirstName}
                onChange={(value) => onFieldChange('customerFirstName', value)}
                placeholder="Ana"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Apellidos" id="customer-last-name">
              <TextInput
                id="customer-last-name"
                value={formData.customerLastName}
                onChange={(value) => onFieldChange('customerLastName', value)}
                placeholder="Pérez"
                autoComplete="family-name"
              />
            </Field>
            <Field label="Correo electrónico" id="customer-email">
              <TextInput
                id="customer-email"
                type="email"
                value={formData.customerEmail}
                onChange={(value) => onFieldChange('customerEmail', value)}
                placeholder="ana@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Teléfono" id="customer-phone">
              <TextInput
                id="customer-phone"
                value={formData.customerPhone}
                onChange={(value) => onFieldChange('customerPhone', value)}
                placeholder="+34 600 000 000"
                autoComplete="tel"
                inputMode="tel"
              />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <header className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Pago</h3>
            <p className="text-xs text-slate-500">
              Información de tarjeta necesaria para autorizar el cobro.
            </p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Titular" id="card-holder">
              <TextInput
                id="card-holder"
                value={formData.paymentCardHolder}
                onChange={(value) => onFieldChange('paymentCardHolder', value)}
                placeholder="Ana Pérez"
                autoComplete="cc-name"
              />
            </Field>
            <Field label="Número de tarjeta" id="card-number" description="Solo se almacenarán los últimos 4 dígitos.">
              <TextInput
                id="card-number"
                value={formData.paymentCardNumber}
                onChange={(value) => onFieldChange('paymentCardNumber', value)}
                placeholder="4242 4242 4242 4242"
                autoComplete="cc-number"
                inputMode="numeric"
                maxLength={23}
              />
            </Field>
            <Field label="Vencimiento" id="card-expiry" description="Formato MM/AA.">
              <TextInput
                id="card-expiry"
                value={formData.paymentCardExpiry}
                onChange={(value) => onFieldChange('paymentCardExpiry', value)}
                placeholder="04/28"
                autoComplete="cc-exp"
                pattern="\d{2}\s*/\s*\d{2,4}"
                inputMode="numeric"
                maxLength={7}
              />
            </Field>
            <Field label="CVV" id="card-cvv" description="No se persiste, solo valida la captura.">
              <TextInput
                id="card-cvv"
                value={formData.paymentCardCvv}
                onChange={(value) => onFieldChange('paymentCardCvv', value)}
                placeholder="123"
                autoComplete="cc-csc"
                inputMode="numeric"
                maxLength={4}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <header className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wide">Confirmación</h3>
            <p className="text-xs text-slate-500">Detalles utilizados para generar el evento final.</p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Moneda" id="currency-select">
              <CurrencySelect
                id="currency-select"
                value={formData.currency}
                onChange={(value) => onFieldChange('currency', value)}
              />
            </Field>
            <Field
              label="Confirmado"
              id="confirmed-at-input"
              description="Fecha y hora en que se completó el checkout."
            >
              <DateInput
                id="confirmed-at-input"
                value={formData.confirmedAt}
                onChange={(value) => onFieldChange('confirmedAt', value)}
              />
            </Field>
          </div>
        </div>
      </div>
    );
  }

  function ItemsSummary({ items, currency }) {
    if (!items.length) {
      return (
        <p className="text-xs text-slate-500 bg-slate-100 border border-dashed border-slate-300 rounded-lg px-4 py-3 text-center">
          Selecciona cantidades para preparar el pedido.
        </p>
      );
    }

    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    return (
      <div className="space-y-3">
        <ul className="space-y-2 text-sm">
          {items.map((item) => (
            <li key={item.sku} className="flex items-baseline justify-between">
              <span className="text-slate-600">{item.quantity}× {item.name}</span>
              <span className="font-medium text-slate-900">
                {formatCurrency(item.price * item.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
          <span>Total</span>
          <span>{formatCurrency(total, currency)}</span>
        </div>
      </div>
    );
  }

  function EventPreview({ event }) {
    const pretty = useMemo(() => JSON.stringify(event, null, 2), [event]);

    return (
      <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 overflow-x-auto border border-slate-800">
        {pretty}
      </pre>
    );
  }

  function EcommerceWidget({ container }) {
    const [quantities, updateQuantity] = useQuantities(PRODUCTS);
    const [formData, updateField] = useCheckoutForm();

    const items = useMemo(() => buildItems(PRODUCTS, quantities), [quantities]);
    const event = useMemo(() => buildOrderEvent({ formData, items }), [formData, items]);

    const currency = formData.currency || DEFAULT_CURRENCY;
    const apiOrigin = useMemo(() => getApiOrigin(container), [container]);
    const ordersEndpoint = useMemo(() => buildOrdersEndpoint(apiOrigin), [apiOrigin]);

    const [submissionState, setSubmissionState] = useState({
      status: 'idle',
      message: null,
      details: null,
    });

    const isSending = submissionState.status === 'sending';
    const isSubmitDisabled = isSending || items.length === 0;

    const handleSend = async () => {
      if (!items.length) {
        setSubmissionState({
          status: 'error',
          message: 'Agrega al menos un producto antes de confirmar el pedido.',
          details: null,
        });
        return;
      }

      if (!ordersEndpoint) {
        setSubmissionState({
          status: 'error',
          message: 'La URL del servicio de ecommerce no es válida.',
          details: null,
        });
        return;
      }

      setSubmissionState({ status: 'sending', message: null, details: null });

      try {
        const response = await fetch(ordersEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event.payload),
        });

        if (!response.ok) {
          let errorMessage = 'El servicio de ecommerce rechazó la petición.';
          try {
            const errorBody = await response.json();
            if (errorBody && typeof errorBody.message === 'string') {
              errorMessage = errorBody.message;
            }
          } catch (_error) {
            // Ignorar errores al interpretar la respuesta
          }

          setSubmissionState({
            status: 'error',
            message: errorMessage,
            details: { status: response.status },
          });
          return;
        }

        let data = null;
        try {
          data = await response.json();
        } catch (_error) {
          data = {};
        }

        setSubmissionState({
          status: 'success',
          message: 'Pedido enviado correctamente.',
          details: {
            orderId: data && typeof data.orderId === 'string' ? data.orderId : null,
            confirmedAt: data && typeof data.confirmedAt === 'string' ? data.confirmedAt : null,
          },
        });
      } catch (_error) {
        setSubmissionState({
          status: 'error',
          message: 'No se pudo conectar con el servicio de ecommerce.',
          details: null,
        });
      }
    };

    return (
      <div className="h-full flex flex-col">
        <header className="pb-6 border-b border-slate-200">
          <h1 className="text-2xl font-semibold text-slate-900">Checkout de ecommerce</h1>
          <p className="text-sm text-slate-600 mt-2">
            Simula la confirmación de un pedido digital construyendo el evento <code>OrderConfirmed</code>.
          </p>
        </header>

        <div className="py-6 flex-1 space-y-6">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Catálogo</h2>
            <ProductsGrid
              products={PRODUCTS}
              quantities={quantities}
              onQuantityChange={updateQuantity}
              currency={currency}
            />
          </section>

          <section className="space-y-4">
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div>
                <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Resumen</h2>
                <p className="text-xs text-amber-700/80">
                  Los importes se calculan automáticamente según las cantidades seleccionadas.
                </p>
              </div>
              <ItemsSummary items={items} currency={currency} />
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Datos del pedido</h2>
            <OrderForm formData={formData} onFieldChange={updateField} />
          </section>
        </div>

        <section className="mt-auto space-y-3">
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Evento a emitir</h2>
              <p className="text-xs text-slate-500">Revisa la carga útil antes de publicar en el bus de eventos.</p>
            </div>
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
              OrderConfirmed
            </span>
          </header>
          <EventPreview event={event} />
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <button
                type="button"
                onClick={handleSend}
                disabled={isSubmitDisabled}
                className="inline-flex items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/70 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? 'Enviando…' : 'Enviar pedido'}
              </button>
              <span className="text-[11px] text-slate-500">
                Servicio: <code className="font-mono text-slate-600">{apiOrigin}</code>
              </span>
            </div>
            {submissionState.status === 'success' ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
                <p className="font-medium">{submissionState.message}</p>
                <ul className="mt-1 space-y-0.5 text-[12px] text-emerald-700/90">
                  {submissionState.details?.orderId ? (
                    <li>
                      ID de pedido: <code className="font-mono">{submissionState.details.orderId}</code>
                    </li>
                  ) : null}
                  {submissionState.details?.confirmedAt ? (
                    <li>Confirmado en: {submissionState.details.confirmedAt}</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            {submissionState.status === 'error' ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                <p className="font-medium">
                  {submissionState.message || 'No se pudo enviar el pedido.'}
                </p>
                {submissionState.details?.status ? (
                  <p className="mt-1 text-[12px] text-rose-600/80">Código de estado: {submissionState.details.status}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  const container = document.getElementById('ventasdigitales-ecommerce-root');
  if (!container) {
    throw new Error('No se encontró el contenedor del widget de ecommerce.');
  }

  const root = createRoot(container);
  root.render(<EcommerceWidget container={container} />);
})();
