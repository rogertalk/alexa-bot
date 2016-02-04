'use strict';

const config = require('./secrets/alexa.json');
const utils = require('./utils');

// Static message body that the Alexa Voice Service expects.
const recognizeMessage = {
  messageHeader: {
    deviceContext: [
      {
        name: 'playbackState',
        namespace: 'AudioPlayer',
        payload: {
          streamId: '',
          offsetInMilliseconds: 0,
          playerActivity: 'IDLE',
        },
      },
    ],
  },
  messageBody: {
    profile: 'alexa-close-talk',
    locale: 'en-us',
    format: 'audio/L16; rate=16000; channels=1',
  },
};

function createRecognizeOptions(accessToken, audioBuffer) {
  return {
    encoding: null,
    formData: {
      request: {
        value: JSON.stringify(recognizeMessage),
        options: {
          contentType: 'application/json; charset=UTF-8',
        },
      },
      audio: {
        value: audioBuffer,
        options: {
          contentType: 'audio/L16; rate=16000; channels=1',
        },
      },
    },
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    method: 'POST',
    url: 'https://access-alexa-na.amazon.com/v1/avs/speechrecognizer/recognize',
  };
}

function exhaustAudioPlayer(accessToken, parts, previousParts) {
  // Find the most recent JSON data object.
  let body;
  for (let part of parts) {
    if (part.headers['content-type'] == 'application/json') {
      const data = JSON.parse(part.body.toString('utf8'));
      if (data.messageBody) body = data.messageBody;
      break;
    }
  }
  if (previousParts) {
    parts = previousParts.concat(parts);
  }
  if (!body) return parts;
  // Look for a navigation token in the JSON data.
  let navigationToken;
  if (body.navigationToken) {
    navigationToken = body.navigationToken;
  } else if (body.directives) {
    for (let directive of body.directives) {
      if (directive.namespace != 'AudioPlayer' || !directive.payload.navigationToken) {
        continue;
      }
      navigationToken = directive.payload.navigationToken;
      break;
    }
  }
  if (!navigationToken) return parts;
  // Request the next audio item.
  const payload = {
    messageHeader: {},
    messageBody: {navigationToken},
  };
  const options = {
    encoding: null,
    body: JSON.stringify(payload),
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    url: 'https://access-alexa-na.amazon.com/v1/avs/audioplayer/getNextItem',
  };
  return utils.promisedRequest(options).then(newParts => exhaustAudioPlayer(accessToken, newParts, parts));
}

// Finds all the audio files in the response and resolves to a list of audio metadata.
function getAudioMetadata(parts) {
  parts = parts.filter(p => p.headers['content-type'] == 'audio/mpeg');
  const promises = parts.map(p => utils.bufferDuration(p.body));
  return Promise.all(promises).then(durations => {
    return durations.map((duration, i) => {
      return {
        buffer: parts[i].body,
        duration,
        headers: parts[i].headers,
      };
    });
  });
}

// Exchanges a user's refresh token for an access token.
exports.exchangeRefreshToken = function exchangeRefreshToken(token) {
  const options = {
    form: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token,
    },
    method: 'POST',
    url: 'https://api.amazon.com/auth/o2/token',
  };
  return utils.promisedRequest(options).then(JSON.parse);
};

// Asks the Amazon Voice Service to recognize the speech in the provided audio file.
exports.recognize = function recognize(accessToken, stream) {
  return utils.streamToBuffer(stream)
    .then(buffer => createRecognizeOptions(accessToken, buffer))
    .then(utils.promisedRequest)
    .then(parts => exhaustAudioPlayer(accessToken, parts))
    .then(getAudioMetadata);
};
