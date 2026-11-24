import type { WeatherAtmosphereTheme } from '../../lib/weatherService';

/**
 * Serene, restrained environmental backdrop driven by live outdoor weather.
 * Keeps the focus squarely on the living 3D botanical companion — no noisy
 * twinkling starfields, harsh sunbeam cones, or theatrical clutter.
 */
export function WeatherBackdrop({ theme }: { theme: WeatherAtmosphereTheme }) {
  const skyStyle = {
    background: `linear-gradient(180deg, ${theme.skyTop} 0%, ${theme.skyMid} 58%, ${theme.skyHorizon} 100%)`,
  };

  return (
    <div className="weather-backdrop" style={skyStyle} aria-hidden="true" data-atmosphere={theme.id}>
      {/* Soft celestial glow (restrained, never competing with the plant silhouette) */}
      {theme.celestial === 'sun' && (
        <div className="weather-sun">
          <span className="weather-sun-halo" />
          <span className="weather-sun-core" />
        </div>
      )}

      {theme.celestial === 'low-sun' && (
        <div className="weather-sun weather-sun-low">
          <span className="weather-sun-halo" />
          <span className="weather-sun-core" />
        </div>
      )}

      {theme.celestial === 'moon' && (
        <div className="weather-moon">
          <span className="weather-moon-halo" />
          <svg viewBox="0 0 64 64" className="weather-moon-svg">
            <path d="M39 10a22 22 0 1 0 15 38A18 18 0 0 1 39 10Z" fill="#fff7db" opacity="0.88" />
          </svg>
        </div>
      )}

      {/* Gentle atmospheric clouds when overcast/cloudy/rain */}
      {theme.clouds !== 'none' && (
        <div className={`weather-clouds weather-clouds-${theme.clouds}`}>
          <svg className="weather-cloud cloud-a" viewBox="0 0 260 90">
            <path
              d="M36 74h182c18 0 32-12 32-27 0-14-12-26-28-27-6-13-21-20-38-20-16 0-30 7-38 18-6-4-14-6-23-6-19 0-35 12-39 28-2 0-4-.5-6-.5-16 0-28 11-28 24.5 0 5.5 2 10 8 10Z"
              fill="currentColor"
            />
          </svg>
          <svg className="weather-cloud cloud-b" viewBox="0 0 240 84">
            <path
              d="M28 68h174c15 0 28-10 28-23s-11-22-25-23c-5-12-19-20-35-20-14 0-27 6-34 16-6-3-13-5-21-5-16 0-30 10-34 23-14 1-25 11-25 22 0 5 4 10 12 10Z"
              fill="currentColor"
            />
          </svg>
        </div>
      )}

      {/* Soft mist veil for fog */}
      {theme.id === 'fog' && (
        <div className="weather-mist-bands">
          <span className="weather-mist weather-mist-1" />
          <span className="weather-mist weather-mist-2" />
        </div>
      )}

      {/* Calm low-horizon botanical hills grounding the living habitat */}
      <svg
        className="weather-landscape"
        viewBox="0 0 1200 320"
        preserveAspectRatio="xMidYMax slice"
      >
        <path
          d="M0 240 Q 260 198, 560 226 T 1200 222 L 1200 320 L 0 320 Z"
          fill={theme.hillFar}
          opacity="0.58"
        />
        <path
          d="M0 264 Q 320 228, 660 256 T 1200 248 L 1200 320 L 0 320 Z"
          fill={theme.hillMid}
          opacity="0.78"
        />
        <path
          d="M0 288 Q 360 262, 720 278 T 1200 276 L 1200 320 L 0 320 Z"
          fill={theme.hillNear}
        />
        <ellipse
          cx="600"
          cy="314"
          rx="480"
          ry="44"
          fill={theme.groundTint}
          opacity="0.28"
        />
      </svg>
    </div>
  );
}
