'use strict';

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const request = require('request');
const stream = require('stream');
const tmp = require('tmp');

// Takes an audio buffer and gets its duration.
exports.bufferDuration = function bufferDuration(buffer) {
  return new Promise((resolve, reject) => {
    // ffprobe can't get duration data from streams so we need to write the file to disk.
    tmp.file({postfix: '.mp3'}, (error, path, fd, unlink) => {
      if (error) {
        reject(error);
        return;
      }
      fs.write(fd, buffer, 0, buffer.length, error => {
        if (error) {
          unlink();
          reject(error);
          return;
        }
        ffmpeg.ffprobe(path, (error, metadata) => {
          unlink();
          if (error) {
            reject(error);
            return;
          }
          resolve(Math.round(metadata.format.duration * 1000));
        });
      });
    });
  });
};

// Performs a request using the request package, but returns a promise instead of using callbacks.
exports.promisedRequest = function promisedRequest(options) {
  return new Promise((resolve, reject) => {
    request(options, (error, res, body) => {
      if (error) {
        reject(error);
        return;
      }
      if (options.encoding !== null) {
        resolve(body);
        return;
      }
      const typeParts = res.headers['content-type'].split(/\s*;\s*/g);
      // Amazon uses multipart/related for some of their responses, which isn't well supported.
      if (typeParts.shift() == 'multipart/related') {
        const meta = {};
        // Super simple header value parser.
        for (let part of typeParts) {
          const index = part.indexOf('=');
          if (index !== -1) meta[part.substr(0, index)] = part.substr(index + 1);
        }
        // Super simple multipart parser.
        const boundary = new Buffer('--' + meta.boundary);
        const bodyParts = [];
        let i = 0, j, headers, key, state = 'init';
        function line() {
          const b = body[i];
          if (b != 10 && b != 13) return false;
          if (b == 13) {
            i++;
            if (body[i] != 10) throw new Error('Expected newline after carriage return');
          }
          i++;
          return true;
        }
        while (i < body.length) {
          const b = body[i];
          switch (state) {
          case 'body':
          case 'init':
            if (b == 45 && body.slice(i, i + boundary.length).compare(boundary) === 0) {
              if (state == 'body') {
                if (body[i - 1] != 10) throw new Error('Expected new line');
                bodyParts.push({headers, body: body.slice(j, i - 1 - (body[i - 2] == 13))});
              }
              headers = {};
              i += boundary.length;
              if (body[i] == 45 && body[i + 1] == 45) {
                i += 2;
                state = 'end';
              } else {
                state = 'header-key';
              }
              if (!line()) throw new Error('Expected new line');
              j = i;
              continue;
            }
            break;
          case 'end':
            throw new Error('Encountered content beyond end of multipart');
          case 'header-key':
            if (b == 58) {
              key = body.slice(j, i).toString();
              while (body[++i] == 32);
              state = 'header-value';
              j = i;
              continue;
            } else if (line()) {
              j = i;
              state = 'body';
              continue;
            }
            break;
          case 'header-value':
            const k = i;
            if (line()) {
              headers[key] = body.slice(j, k).toString();
              j = i;
              state = 'header-key';
              continue;
            }
          }
          i++;
        }
        resolve(bodyParts);
      }
      resolve([{headers: res.headers, body}]);
    });
  });
};

// Takes a stream and resolves to a byte buffer.
exports.streamToBuffer = function streamToBuffer(stream) {
  const buffers = [];
  stream.on('data', buffer => buffers.push(buffer));
  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      resolve(Buffer.concat(buffers));
    });
    stream.on('error', error => reject(error));
  });
};

// Converts the provided audio data stream to the simple mono Wave format that Amazon expects.
exports.streamToWaveStream = function streamToWaveStream(stream) {
  return ffmpeg(stream)
    .audioChannels(1)
    .audioCodec('pcm_s16le')
    .audioFrequency(16000)
    .format('wav')
    .stream();
};
