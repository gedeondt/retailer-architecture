'use strict';

const { startCrmService } = require('./server');
const {
  CrmSyncProcessor,
  DEFAULT_COLLECTION,
  DEFAULT_EVENT_CHANNEL,
  DEFAULT_CONSUMER_NAME,
} = require('./crm-sync-processor');

module.exports = {
  startCrmService,
  CrmSyncProcessor,
  DEFAULT_COLLECTION,
  DEFAULT_EVENT_CHANNEL,
  DEFAULT_CONSUMER_NAME,
};
