'use strict';

const { SimpleEventLog, EventConsumer } = require('./event-log');

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
};

if (require.main === module) {
  (async () => {
    const { log } = await startEventBus();
    const message = [
      'Event bus inicializado.',
      `Directorio de datos: ${log.dataDir}`,
      'Utiliza require("@retailer/sistemas-event-bus") para interactuar con la cola.',
    ].join('\n');
    console.log(message);
  })().catch((error) => {
    console.error('Error al inicializar el event bus', error);
    process.exitCode = 1;
  });
}
