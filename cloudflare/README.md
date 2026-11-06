# JOE Studio — Cloudflare D1 verified chord library

JOE Studio no longer relies on the expired Render YouTube extractor. YouTube
iframes supply playback/time synchronization only; they cannot supply audio
samples for chord detection. A cache miss prompts the visitor to upload an
audio file they have permission to analyze. The existing in-browser MIR engine
then creates a local chord timeline.

## Free Cloudflare D1 setup (one-time)

1. Sign in at https://dash.cloudflare.com and create a **D1 SQL Database**
   named `joe-chords` under Workers & Pages / Storage & Databases.
2. Open that D1 database's **Console** and execute
   [d1-schema.sql](d1-schema.sql) once.
3. Create a **scoped Cloudflare API token** with D1 Read and D1 Write for the
   correct account. Keep it secret.
4. In **Vercel → JOE-Music → Settings → Environment Variables**, add the
   following values for Production (and Preview only if desired):

   - `CF_D1_ACCOUNT_ID`: Cloudflare account ID
   - `CF_D1_DATABASE_ID`: newly created D1 database ID
   - `CF_D1_API_TOKEN`: scoped Cloudflare API token
   - `CHORD_PUBLISH_TOKEN`: a separate strong secret for **owner-only**
     publishing (never put this in a `VITE_*` variable or commit it)

5. Redeploy the **Vercel frontend** to apply the environment variables.
   Existing songs can be looked up through
   `GET /api/verified-chords?videoId=XXXXXXXXXXX`.

Until D1 is configured, the API returns 503 instead of fake "verified" songs;
uncached songs still work through the authorized-file upload path.

## Curated publishing

Only the owner can write trusted records. POST to `/api/verified-chords` with
`Authorization: Bearer <CHORD_PUBLISH_TOKEN>` and JSON body
`{"videoId":"XXXXXXXXXXX","song":{...}}`.
The song must contain a genuine, independently reviewed audio-derived
`chordSegments` timeline and `analysisSource: "audio"`.
The server performs format checks and enforces the publishing secret; however,
**human provenance review is essential** — no JSON field can prove audio analysis.

Public browser uploads are intentionally **not** auto-published to the shared
library: otherwise any visitor could inject fabricated chords into the library.
They remain in local IndexedDB and can be reviewed/imported later.

The D1 REST API is used server-side by Vercel to avoid exposing secrets. For
very high traffic, consider a Cloudflare Worker bound to D1 instead of the REST
administrative query API. The Cloudflare free tier has read/write/size limits.

## Limitations

This change does **not** automatically retrieve audio for arbitrary uncached
YouTube links. An iframe does not expose PCM; D1 is storage, not an audio
extractor. A separate permitted audio source would be required to restore
one-click extraction of previously unseen songs.
