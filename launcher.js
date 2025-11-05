'use strict';

const http = require('node:http');
const { once } = require('node:events');

const DASHBOARD_HTML = createDashboardHTML();

function createDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launcher Retailer - Dashboard Maestro</title>
    <link
      href="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
      rel="stylesheet"
    />
  </head>
  <body class="bg-slate-100 min-h-screen text-slate-900">
    <div class="min-h-screen flex flex-col">
      <header class="bg-slate-900 text-white shadow">
        <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <p class="text-sm uppercase tracking-wide text-amber-300">Launcher Retailer</p>
            <h1 class="text-2xl font-semibold">Panel maestro de microfrontends</h1>
          </div>
          <nav class="flex gap-4 text-sm">
            <a class="hover:text-amber-300" href="#home">Inicio</a>
            <a class="hover:text-amber-300" href="#dominios">Dominios</a>
            <a class="hover:text-amber-300" href="#sistemas">Sistemas</a>
          </nav>
        </div>
      </header>

      <main class="flex-1">
        <section id="home" class="max-w-7xl mx-auto px-6 py-10">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-semibold">Inicio</h2>
              <p class="text-sm text-slate-500">
                Selección curada de widgets críticos para la operación diaria.
              </p>
            </div>
            <span class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Vista 4 columnas
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 auto-rows-[minmax(160px,_1fr)]">
            <article
              class="col-span-1 sm:col-span-2 xl:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col"
              data-widget-id="ventas-pedidos"
              data-widget-size="2"
            >
              <header class="mb-4">
                <p class="text-xs uppercase tracking-wide text-amber-500">Ventas Digitales</p>
                <h3 class="text-lg font-semibold">Pedidos hoy</h3>
              </header>
              <div class="grid grid-cols-2 gap-4 flex-1">
                <div>
                  <p class="text-3xl font-bold">845</p>
                  <p class="text-xs text-slate-500">Pedidos confirmados</p>
                </div>
                <div>
                  <p class="text-3xl font-bold text-emerald-500">+12%</p>
                  <p class="text-xs text-slate-500">Vs. promedio semanal</p>
                </div>
              </div>
              <footer class="mt-6 text-xs text-slate-500">
                Microfront de orquestación muestra KPI de demanda con tendencia.
              </footer>
            </article>

            <article
              class="col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col"
              data-widget-id="logistica-sla"
              data-widget-size="1"
            >
              <header class="mb-4">
                <p class="text-xs uppercase tracking-wide text-blue-500">Logística</p>
                <h3 class="text-lg font-semibold">Cumplimiento SLA</h3>
              </header>
              <div class="flex-1">
                <ul class="space-y-2 text-sm">
                  <li class="flex justify-between">
                    <span>En curso</span>
                    <span class="font-semibold">92%</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Retrasos</span>
                    <span class="font-semibold text-red-500">5%</span>
                  </li>
                  <li class="flex justify-between">
                    <span>Incidencias</span>
                    <span class="font-semibold text-amber-500">18</span>
                  </li>
                </ul>
              </div>
              <footer class="mt-6 text-xs text-slate-500">
                Widget compacto de seguimiento de envíos.
              </footer>
            </article>

            <article
              class="col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col"
              data-widget-id="atencion-sentiment"
              data-widget-size="1"
            >
              <header class="mb-4">
                <p class="text-xs uppercase tracking-wide text-rose-500">Atención al Cliente</p>
                <h3 class="text-lg font-semibold">Pulso de satisfacción</h3>
              </header>
              <div class="flex-1 flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <span class="text-3xl">🙂</span>
                  <div>
                    <p class="text-sm font-semibold">73% positivo</p>
                    <p class="text-xs text-slate-500">Basado en tickets de hoy</p>
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-xs">
                  <div class="bg-emerald-100 text-emerald-700 rounded-lg px-2 py-1 text-center">Feedback</div>
                  <div class="bg-amber-100 text-amber-700 rounded-lg px-2 py-1 text-center">Tiempo de respuesta</div>
                  <div class="bg-slate-100 text-slate-700 rounded-lg px-2 py-1 text-center">Top incidencias</div>
                </div>
              </div>
              <footer class="mt-6 text-xs text-slate-500">
                Microfront de escucha social integrado al panel.
              </footer>
            </article>

            <article
              class="col-span-1 sm:col-span-2 xl:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm p-6"
              data-widget-id="contabilidad-caja"
              data-widget-size="4"
            >
              <header class="flex items-center justify-between mb-4">
                <div>
                  <p class="text-xs uppercase tracking-wide text-violet-500">Contabilidad</p>
                  <h3 class="text-lg font-semibold">Salud de caja</h3>
                </div>
                <span class="text-xs text-slate-500">Widget panorámico (4 columnas)</span>
              </header>
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="md:col-span-2">
                  <p class="text-sm text-slate-500">Facturación neta (hoy)</p>
                  <p class="text-2xl font-bold">$ 245.800</p>
                  <p class="text-xs text-emerald-600 mt-1">+8% vs. ayer</p>
                </div>
                <div>
                  <p class="text-sm text-slate-500">Reembolsos pendientes</p>
                  <p class="text-lg font-semibold text-amber-600">$ 12.400</p>
                </div>
                <div>
                  <p class="text-sm text-slate-500">Alertas fiscales</p>
                  <p class="text-lg font-semibold text-red-500">2</p>
                </div>
              </div>
              <div class="mt-6 text-xs text-slate-500">
                Representa un microfront de control financiero con indicadores agrupados.
              </div>
            </article>
          </div>
        </section>

        <section id="dominios" class="bg-white border-y border-slate-200">
          <div class="max-w-7xl mx-auto px-6 py-10">
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-semibold">Widgets por dominio</h2>
              <span class="text-xs uppercase tracking-wide text-slate-500">Catálogo completo</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 auto-rows-[minmax(160px,_1fr)]">
              <article class="col-span-1 bg-slate-50 rounded-xl border border-slate-200 p-6">
                <h3 class="text-base font-semibold mb-2">Ventas Digitales</h3>
                <p class="text-sm text-slate-600">
                  Widgets de funnels, rendimiento de campañas y métricas de conversión.
                </p>
                <button class="mt-4 text-sm font-semibold text-amber-600 hover:text-amber-700">
                  Ver catálogo
                </button>
              </article>
              <article class="col-span-1 bg-slate-50 rounded-xl border border-slate-200 p-6">
                <h3 class="text-base font-semibold mb-2">Logística</h3>
                <p class="text-sm text-slate-600">
                  Paneles de fulfillment, rutas inteligentes y control de inventario.
                </p>
                <button class="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Ver catálogo
                </button>
              </article>
              <article class="col-span-1 bg-slate-50 rounded-xl border border-slate-200 p-6">
                <h3 class="text-base font-semibold mb-2">Atención al Cliente</h3>
                <p class="text-sm text-slate-600">
                  Gestión de casos, sentiment analysis y monitoreo de canales.
                </p>
                <button class="mt-4 text-sm font-semibold text-rose-600 hover:text-rose-700">
                  Ver catálogo
                </button>
              </article>
              <article class="col-span-1 bg-slate-50 rounded-xl border border-slate-200 p-6">
                <h3 class="text-base font-semibold mb-2">Contabilidad</h3>
                <p class="text-sm text-slate-600">
                  Estados financieros, conciliaciones y alertas de cumplimiento.
                </p>
                <button class="mt-4 text-sm font-semibold text-violet-600 hover:text-violet-700">
                  Ver catálogo
                </button>
              </article>
            </div>
          </div>
        </section>

        <section id="sistemas" class="max-w-7xl mx-auto px-6 py-10">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold">Sistemas transversales</h2>
            <span class="text-xs uppercase tracking-wide text-slate-500">
              Integraciones globales
            </span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h3 class="text-base font-semibold mb-2">Bus de eventos</h3>
              <p class="text-sm text-slate-600">
                Estado de tópicos, latencia promedio y última actividad registrada.
              </p>
              <div class="mt-4 text-xs text-slate-500">
                Permite que los microfronts identifiquen la salud de las integraciones.
              </div>
            </article>
            <article class="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h3 class="text-base font-semibold mb-2">Analítica unificada</h3>
              <p class="text-sm text-slate-600">
                Widgets para tableros ejecutivos con métricas agregadas entre dominios.
              </p>
              <div class="mt-4 text-xs text-slate-500">
                Representa microfronts de sistemas transversales reutilizables.
              </div>
            </article>
          </div>
        </section>
      </main>

      <footer class="bg-slate-900 text-slate-300">
        <div class="max-w-7xl mx-auto px-6 py-4 text-sm">
          Launcher pensado para orquestar microfronts modulares con distribución en 1, 2 o 4 columnas.
        </div>
      </footer>
    </div>
  </body>
</html>`;
}

async function startLauncher(options = {}) {
  const { port = 0, host = '127.0.0.1' } = options;
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Método no permitido');
      return;
    }

    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DASHBOARD_HTML);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  });

  server.listen(port, host);
  await once(server, 'listening');

  const addressInfo = server.address();
  const resolvedHost = addressInfo.address === '::' ? 'localhost' : addressInfo.address;
  const url = `http://${resolvedHost}:${addressInfo.port}/`;

  const close = () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

  return { url, close, server };
}

module.exports = {
  startLauncher,
  createDashboardHTML,
};

if (require.main === module) {
  startLauncher()
    .then(({ url }) => {
      console.log(`Dashboard disponible en ${url}`);
    })
    .catch((error) => {
      console.error('Error al iniciar el launcher', error);
      process.exitCode = 1;
    });
}
