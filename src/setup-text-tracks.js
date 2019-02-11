import videojs from 'video.js';

function find(l, f) {
  for (let i = 0; i < l.length; i++) {
    if (f(l[i])) {
      return l[i];
    }
  }
}

/*
 * Attach text tracks from dash.js to videojs
 *
 * @param {videojs} player the videojs player instance
 * @param {array} tracks the tracks loaded by dash.js to attach to videojs
 *
 * @private
 */
function attachDashTextTracksToVideojs(player, shaka, tracks) {

  const trackDictionary = [];

  // Add remote tracks
  const tracksAttached = tracks
    // Map input data to match HTMLTrackElement spec
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLTrackElement
    .map((track) => ({
      dashTrack: track,
      trackConfig: {
        label: track.language,
        language: track.language,
        srclang: track.language,
        kind: track.kind
      }
    }))

    // Add track to videojs track list
    .map(({trackConfig, dashTrack}) => {
      const remoteTextTrack = player.addRemoteTextTrack(trackConfig, false);

      trackDictionary.push({textTrack: remoteTextTrack.track, dashTrack});

      // Don't add the cues becuase we're going to let dash handle it natively. This will ensure
      // that dash handle external time text files and fragmented text tracks.
      //
      // Example file with external time text files:
      // https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-wvtt/dash.mpd

      return remoteTextTrack;
    });

  /*
   * Scan `videojs.textTracks()` to find one that is showing. Set the dash text track.
   */
  function updateActiveDashTextTrack() {

    let dashTrackToActivate;
    const textTracks = player.textTracks();

    // Iterate through the tracks and find the one marked as showing. If none are showing,
    // disable text tracks.
    for (let i = 0; i < textTracks.length; i += 1) {
      const textTrack = textTracks[i];

      if (textTrack.mode === 'showing') {
        // Find the dash track we want to use

        /* jshint loopfunc: true */
        const dictionaryLookupResult = find(trackDictionary,
          (track) => track.textTrack === textTrack);
        /* jshint loopfunc: false */

        dashTrackToActivate = dictionaryLookupResult ?
          dictionaryLookupResult.dashTrack :
          null;
      }
    }

    // If the text track has changed, then set it in shaka
    if (dashTrackToActivate) {
      shaka.selectTextTrack(dashTrackToActivate);
      shaka.setTextTrackVisibility(true);
    } else {
      shaka.setTextTrackVisibility(false);
    }

  }

  // Update dash when videojs's selected text track changes.
  player.textTracks().on('change', updateActiveDashTextTrack);

  // Cleanup event listeners whenever we start loading a new source
  shaka.addEventListener('unloading', () => {
    player.textTracks().off('change', updateActiveDashTextTrack);
  });

  // Initialize the text track on our first run-through
  updateActiveDashTextTrack();

  return tracksAttached;
}

export default function setupTextTracks(player, shaka) {

  // Store the tracks that we've added so we can remove them later.
  let dashTracksAttachedToVideoJs = [];

  // We're relying on the user to disable native captions. Show an error if they didn't do so.
  if (player.featuresNativeTextTracks) {
    videojs.log.error('You must pass {html: {nativeCaptions: false}} in the videojs constructor ' +
      'to use text tracks in videojs-contrib-dash');
    return;
  }

  // Clear the tracks that we added. We don't clear them all because someone else can add tracks.
  function clearDashTracks() {
    dashTracksAttachedToVideoJs.forEach(player.removeRemoteTextTrack.bind(player));

    dashTracksAttachedToVideoJs = [];
  }

  function handleTextTracksAdded(tracks) {

    // Cleanup old tracks
    clearDashTracks();

    if (!tracks.length) {
      // Don't try to add text tracks if there aren't any
      return;
    }

    // Save the tracks so we can remove them later
    dashTracksAttachedToVideoJs = attachDashTextTracksToVideojs(player, shaka, tracks);
  }

  handleTextTracksAdded(shaka.getTextTracks());

}
