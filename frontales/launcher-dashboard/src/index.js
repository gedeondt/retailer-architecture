'use strict';

const { startLauncher } = require('./server');

startLauncher()
  .then(({ url }) => {
    // eslint-disable-next-line no-console
    console.log(`Dashboard disponible en ${url}`);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Error al iniciar el launcher', error);
    process.exitCode = 1;
  });
