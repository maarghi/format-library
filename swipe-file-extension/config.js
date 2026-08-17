// Central config for "Save to My Formats".
// Loaded by both the popup (<script src>) and the background worker (importScripts),
// so it publishes onto `self` (which is `window` in the popup).
//
// There are two ways to use the extension:
//   • Virio team  → everyone shares ONE library (the deployment + sheet below).
//   • Personal    → each user runs their OWN copy; the guided setup creates it and
//                   the Apps Script auto-builds every tab, header and seed label.
//
// >>> THINGS TO FILL IN are marked TODO below. <<<
self.SF_CONFIG = {
  // ---------- Virio shared library ----------
  // Used ONLY after a teammate passes the email gate. This is your live deployment.
  SHARED_ENDPOINT: 'https://script.google.com/macros/s/AKfycbw1m4CqBomO9dkCeeR1-d7UVxm1pxd-HZXu_v9S9JnpGbP8t6mm30bfJy1wfuppWtm5/exec',
  SHARED_SHEET_ID: '1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg',

  // ---------- Virio team code ----------
  // Teammates type this once to unlock the library. Give it to the team; rotate it
  // whenever you like (everyone just re-enters the new code).  TODO: set your own code.
  VIRIO_CODE: 'virio-frogs'
};
