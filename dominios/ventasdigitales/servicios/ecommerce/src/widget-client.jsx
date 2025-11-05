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

  function useCheckoutForm() {
    const [formData, setFormData] = useState({
      orderId: '',
      customerId: '',
      paymentId: '',
      currency: DEFAULT_CURRENCY,
      confirmedAt: new Date().toISOString().slice(0, 16),
    });

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

    return {
      name: 'OrderConfirmed',
      payload: {
        orderId: formData.orderId || '',
        customerId: formData.customerId || '',
        paymentId: formData.paymentId || '',
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

  function TextInput({ id, value, onChange, placeholder, autoComplete }) {
    return (
      <input
        id={id}
        type="text"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
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
      <div className="space-y-4">
        <Field
          label="Identificador del pedido"
          id="order-id-input"
          description="UUID o folio interno del pedido confirmado."
        >
          <TextInput
            id="order-id-input"
            value={formData.orderId}
            onChange={(value) => onFieldChange('orderId', value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Cliente"
          id="customer-id-input"
          description="Identificador único del cliente en el CRM."
        >
          <TextInput
            id="customer-id-input"
            value={formData.customerId}
            onChange={(value) => onFieldChange('customerId', value)}
            placeholder="Cliente UUID"
            autoComplete="off"
          />
        </Field>

        <Field
          label="Pago"
          id="payment-id-input"
          description="Referencia del cobro autorizado o capturado."
        >
          <TextInput
            id="payment-id-input"
            value={formData.paymentId}
            onChange={(value) => onFieldChange('paymentId', value)}
            placeholder="Pago UUID"
            autoComplete="off"
          />
        </Field>

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

    return (
      <div className="h-full flex flex-col">
        <header className="pb-6 border-b border-slate-200">
          <h1 className="text-2xl font-semibold text-slate-900">Checkout de ecommerce</h1>
          <p className="text-sm text-slate-600 mt-2">
            Simula la confirmación de un pedido digital construyendo el evento <code>OrderConfirmed</code>.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 py-6 flex-1">
          <section className="lg:col-span-3 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Catálogo</h2>
            <ProductsGrid
              products={PRODUCTS}
              quantities={quantities}
              onQuantityChange={updateQuantity}
              currency={currency}
            />
          </section>

          <section className="lg:col-span-2 space-y-4">
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Datos del pedido</h2>
              <OrderForm formData={formData} onFieldChange={updateField} />
            </div>

            <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
              <div>
                <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wide">Resumen</h2>
                <p className="text-xs text-amber-700/80">
                  Los importes se calculan automáticamente según las cantidades seleccionadas.
                </p>
              </div>
              <ItemsSummary items={items} currency={currency} />
            </div>
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
