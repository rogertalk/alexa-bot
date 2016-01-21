'use strict';

const config = require('./secrets/roger.json');
const utils = require('./utils');

// Simple utility for making Roger API requests.
function api(path, form) {
  const options = {
    formData: form,
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
    },
    method: form ? 'POST' : 'GET',
    url: `https://api.rogertalk.com${path}`,
  };
  return utils.promisedRequest(options).then(JSON.parse);
}

exports.api = api;
