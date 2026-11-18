import { useEffect, useState } from 'react';
import {
  SOUNDS, TIMER_CHOICES, anyPlaying, isPlaying, masterVolume, playSound, playingSounds,
  setLayerVolume, setMasterVolume, setTimer, stopAll, stopSound, subscribeFocus, timeLeftWords, timerLeft,
} from '../data/focusSounds';

/**
 * Steady background sound for studying. Every sound is made by the browser from noise and filters,
 * so nothing is downloaded, it works with no internet, and there can't be a voice or a lyric in it.
 * Nothing plays until it is pressed, and nothing starts again by itself when Study Forge opens.
 */
export function FocusSoundsSection() {
  const [, redraw] = useState(0);
  useEffect(() => subscribeFocus(() => redraw((count) => count + 1)), []);
  // While a timer runs, the words for how long is left are kept fresh.
  useEffect(() => {
    if (!timerLeft()) return;
    const tick = setInterval(() => redraw((count) => count + 1), 1000);
    return () => clearInterval(tick);
  });
  const playing = playingSounds();
  const left = timerLeft();
  return (
    <section aria-labelledby="focus-heading" data-testid="focus-sounds">
      <h2 id="focus-heading">Focus sounds</h2>
      <p className="muted">
        Steady sound to study to. Your browser makes each one as it plays, so none of it is downloaded,
        it all works with no internet, and there are no words in any of it. Nothing plays until you press it.
      </p>
      <ul className="plain-list sound-list">
        {SOUNDS.map((sound) => {
          const on = isPlaying(sound.id);
          const volume = playing.find((layer) => layer.id === sound.id)?.volume ?? 0.5;
          return (
            <li key={sound.id} className="sound-row" data-sound={sound.id} data-on={on ? 'true' : undefined}>
              <button
                type="button"
                className={on ? 'button primary' : 'button'}
                aria-pressed={on}
                onClick={() => (on ? stopSound(sound.id) : playSound(sound.id, volume))}
              >
                {on ? 'Stop' : 'Play'} {sound.name}
              </button>
              <span className="muted small sound-what">{sound.what}</span>
              {on && (
                <label className="sound-volume">
                  {sound.name} volume
                  <input
                    type="range" min="0" max="1" step="0.05" value={volume}
                    onChange={(event) => setLayerVolume(sound.id, Number(event.target.value))}
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <div className="pref-row">
        <label className="sound-volume">Overall volume
          <input
            type="range" min="0" max="1" step="0.05" value={masterVolume()}
            onChange={(event) => setMasterVolume(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="pref-row">
        <h3 id="focus-timer">Stop after a while</h3>
        <div className="session-actions" role="group" aria-labelledby="focus-timer">
          {TIMER_CHOICES.map((minutes) => (
            <button key={minutes} type="button" className="button" onClick={() => setTimer(minutes)} disabled={!anyPlaying()}>
              {minutes} min
            </button>
          ))}
          {left > 0 && <button type="button" className="text-button" onClick={() => setTimer(null)}>Cancel timer</button>}
        </div>
        <p className="muted small" data-testid="focus-timer-state">
          {left > 0 ? `${timeLeftWords(left)}. It fades out rather than stopping suddenly.` : 'No timer. Sound keeps playing until you stop it.'}
        </p>
      </div>

      {anyPlaying() && (
        <div className="session-actions">
          <button type="button" className="button" onClick={stopAll} data-testid="focus-stop-all">Stop all sound</button>
        </div>
      )}
      <p className="muted small">
        Sound comes out of your speakers, so a lecture recording made on this device will pick it up.
        Stop it first, or use headphones, if you are recording.
      </p>
    </section>
  );
}
