'use strict';

const { startDashboardServer } = require('./server');

startDashboardServer()
  .then(({ url }) => {
    // eslint-disable-next-line no-console
    console.log(`Dashboard disponible en ${url}`);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Error al iniciar el dashboard', error);
    process.exitCode = 1;
  });
