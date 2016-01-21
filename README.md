Alexa bot on Roger
==================

This is an implementation of a bot on Roger that lets the user interact
with Alexa from their phone. Note that the auth token exchange step is
not included in this source code.


Running it
----------

We don't expect anyone to actually run this code, it's left more as a
reference implementation of a Roger bot. However, if you'd like to get
parts of it running, you'll need to set up the `secrets` directory with
the appropriate configuration files:

* alexa.json  
  Contains keys `clientId` and `clientSecret`, obtained from Amazon.
* gcloud.json  
  A standard JSON key file from Google Developers Console.
* roger.json:  
  Contains key `accessToken` with a valid Roger access token.

The project also expects access to Google's Datastore API, with a model
named `AlexaAuthData` containing standard OAuth2 fields plus a field
called `LastRefresh` with the date/time data type. The id of an entity
should be the string `account_%d` where `%d` is the Roger account id of
the user whose Alexa account is being accessed.

Finally, this is a Node.js project, so set up dependencies by running
`npm install` (you'll need `ffmpeg` on your system).
