'use strict';

const { SimpleEventLog, EventConsumer } = require('./event-log');
const { startEventBusService } = require('./server');
const { renderWidgetShell, WIDGET_CLIENT_PATH, WIDGET_ID, WIDGET_SIZE, ROOT_ID } = require('./widget-shell');

function createEventLog(options) {
  return new SimpleEventLog(options);
}

async function startEventBus(options = {}) {
  const { resetOnStart = true, ...logOptions } = options;
  const log = createEventLog(logOptions);
  if (resetOnStart) {
    await log.reset();
  }

  const close = async () => {
    if (resetOnStart) {
      await log.reset();
    }
  };

  return { log, close };
}

module.exports = {
  SimpleEventLog,
  EventConsumer,
  createEventLog,
  startEventBus,
  startEventBusService,
  renderWidgetShell,
  WIDGET_CLIENT_PATH,
  WIDGET_ID,
  WIDGET_SIZE,
  ROOT_ID,
};

if (require.main === module) {
  startEventBusService()
    .then(({ url }) => {
      console.log(`Servicio Event Bus disponible en ${url}`);
    })
    .catch((error) => {
      console.error('No se pudo iniciar el Event Bus', error);
      process.exitCode = 1;
    });
}
