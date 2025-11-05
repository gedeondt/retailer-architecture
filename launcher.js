'use strict';

const launcher = require('./frontales/launcher-dashboard/src/server');

module.exports = launcher;

if (require.main === module) {
  launcher
    .startLauncher()
    .then(({ url }) => {
      // eslint-disable-next-line no-console
      console.log(`Dashboard disponible en ${url}`);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error al iniciar el launcher', error);
      process.exitCode = 1;
    });
}
