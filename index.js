'use strict';

const http = require('http');
const request = require('request');

const alexa = require('./alexa');
const roger = require('./roger');
const utils = require('./utils');

// If you want to try this with your own App Engine project, you need to change the project id below.
const gcloud = require('gcloud')({
  projectId: 'roger-web-client',
  keyFilename: 'secrets/gcloud.json',
});

const dataset = gcloud.datastore.dataset();

// Resolves to an Amazon access token, exchanging the refresh token for a new access token if necessary.
function getAccessToken(entity) {
  if (new Date() < +entity.data.LastRefresh + entity.data.ExpiresIn * 1000) {
    return Promise.resolve(entity.data.AccessToken);
  }
  // Access token has probably expired so let's refresh it.
  return alexa.exchangeRefreshToken(entity.data.RefreshToken).then(data => {
    // Update the AlexaAuthData instance on the fly.
    entity.data.AccessToken = data.access_token;
    entity.data.ExpiresIn = data.expires_in;
    entity.data.LastRefresh = new Date();
    entity.data.RefreshToken = data.refresh_token;
    entity.data.TokenType = data.token_type
    dataset.save(entity, error => {
      if (error) console.error('Failed to store auth data', error);
    });
    return data.access_token;
  });
}

// Requests Amazon authentication details from the Datastore API.
function getAuthData(accountId) {
  return new Promise((resolve, reject) => {
    dataset.get(dataset.key(['AlexaAuthData', `account_${accountId}`]), (error, entity) => {
      if (error) reject(error);
      else if (!entity) reject('Could not find auth data');
      else resolve(entity);
    });
  });
}

// Sends the provided audio data (an answer by Alexa) back to the stream on Roger.
function sendAnswer(streamId, answer) {
  return roger.api(`/v21/streams/${streamId}/chunks?duration=${answer.duration}`, {
    audio: {
      value: answer.buffer,
      options: {
        filename: 'answer.mp3',
        contentType: 'audio/mpeg',
      },
    },
  });
}

// Handles the incoming audio and asks Alexa to respond to it.
function respond(data) {
  // Kick off a parallel request that tells the user Alexa "listened".
  roger.api(`/v21/streams/${data.stream.id}?status=talking`, {});
  // Convert the incoming audio to the appropriate Wave format while we get authentication data.
  const wave = utils.streamToWaveStream(request(data.chunk.audio_url));
  // Get the Amazon Voice Service access token for the sender.
  getAuthData(data.chunk.sender_id)
    .then(getAccessToken)
    .then(accessToken => alexa.recognize(accessToken, wave))
    .then(answers => {
      const promise = answers.reduce((seq, a) => {
        return seq.then(() => sendAnswer(data.stream.id, a))
      }, Promise.resolve());
      promise.then(() => {
        roger.api(`/v21/streams/${data.stream.id}?status=idle`, {});
      });
    })
    .catch(error => console.error('Failed to handle chunk:', error.toString()));
}

// Super simple request routing.
function handleRequest(req, res) {
  if (req.url !== '/callback') {
    res.writeHead(404, 'Not Found');
    res.end('Not Found');
    console.log(new Date(), 404, req.url);
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, 'Method Not Allowed', {'Allow': 'POST'});
    res.end('Method Not Allowed');
    console.log(new Date(), 405, req.url);
    return;
  }
  let buffer = '';
  req.on('data', data => buffer += data);
  req.on('end', () => {
    const data = JSON.parse(buffer);
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end('{}');
    console.log(new Date(), 200, req.url, data.type);
    if (data.type != 'stream-chunk') return;
    respond(data);
  });
}

// Listen for incoming HTTP requests.
const port = 8080;
const server = http.createServer(handleRequest);
server.listen(port, function () {
  console.log(`Listening on port ${port}.`);
});
