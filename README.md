# MackeyTV

A 90s video store for the family TV: walk the aisles with the remote, pick up a tape, and it plays in whichever streaming app has it.

- `store/`: the 3D store (three.js). `sh store/build.sh` builds it into `web/`.
- `android/`: the TV app (a full-screen web view plus the hand-off to streaming apps). GitHub Actions builds it on every push.
- `supabase/functions/mtv-admin/`: the server function for manager mode (search, content report, add to shelf). API keys live in Supabase secrets.

## Install on the Chromecast
In Downloader, enter `mackeytv.vercel.app/apk`, install, then open MackeyTV from Apps.

## Adding movies
At the store computer press **MGR**, type the family PIN, press **GO**. Search any movie, check its record, and choose **ADD TO SHELF** or **SAY NO**.

Movie data from TMDB (this product uses the TMDB API but is not endorsed or certified by TMDB), streaming availability from JustWatch, play links from Watchmode, content notes from DoesTheDogDie.com.
