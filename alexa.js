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
    .then(getAudioMetadata);
};
