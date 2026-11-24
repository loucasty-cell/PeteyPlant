import { useId, useState } from 'react';
import type { WeatherAtmosphereTheme } from '../../lib/weatherService';

/**
 * Artistic, interactive multi-layered botanical & meteorological backdrop.
 *
 * Supports 32 distinct nature biome themes across 6 artistic landscape
 * archetypes ('rolling-meadow', 'forest-canopy', 'alpine-peaks',
 * 'coastal-lagoon', 'desert-mesa', 'botanical-arch') and special sky
 * phenomena ('aurora', 'rainbow', 'sunbeams', 'water-shimmer', 'starlight',
 * 'blossoms'), with gentle pointer-reactive parallax depth.
 */
export function WeatherBackdrop({
  theme,
  parallaxOffset = { x: 0, y: 0 },
}: {
  theme: WeatherAtmosphereTheme;
  parallaxOffset?: { x: number; y: number };
}) {
  const uid = useId().replace(/:/g, '');
  const [pulseCount, setPulseCount] = useState(0);

  const px = parallaxOffset.x;
  const py = parallaxOffset.y;

  const skyStyle = {
    background: `linear-gradient(180deg, ${theme.skyTop} 0%, ${theme.skyMid} 54%, ${theme.skyHorizon} 100%)`,
  };

  return (
    <div
      className="weather-backdrop"
      style={skyStyle}
      aria-hidden="true"
      data-atmosphere={theme.id}
      data-landscape={theme.landscape}
      onClick={() => setPulseCount((c) => c + 1)}
    >
      {/* 1. SPECIAL ATMOSPHERIC PHENOMENA */}
      {theme.specialEffect === 'starlight' && (
        <svg className="weather-phenomenon-svg" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMin slice">
          {[
            [110, 62, 1.8], [215, 114, 1.3], [320, 48, 2.1], [460, 88, 1.5],
            [540, 42, 1.4], [690, 74, 2.0], [780, 128, 1.3], [885, 55, 1.9],
            [970, 96, 1.5], [1085, 68, 2.1], [155, 178, 1.2], [410, 152, 1.6],
            [635, 146, 1.4], [835, 172, 1.7], [1035, 155, 1.3], [275, 92, 1.5],
          ].map(([cx, cy, r], idx) => (
            <circle
              key={idx}
              cx={cx + px * 6}
              cy={cy + py * 4}
              r={r}
              fill="#FFFDF2"
              opacity={0.45 + (idx % 4) * 0.14}
            />
          ))}
        </svg>
      )}

      {theme.specialEffect === 'aurora' && (
        <svg className="weather-phenomenon-svg weather-aurora-svg" viewBox="0 0 1200 480" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${uid}-aurora-a`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5CF2B8" stopOpacity="0" />
              <stop offset="35%" stopColor="#5CF2B8" stopOpacity="0.38" />
              <stop offset="70%" stopColor="#38C6D9" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#8E72F2" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={`${uid}-aurora-b`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#72F5C8" stopOpacity="0" />
              <stop offset="48%" stopColor="#65E6B2" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#3AA8D8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M-60 ${170 + py * 8} Q ${320 + px * 18} 55, 640 148 T 1260 110 L 1260 270 Q 880 215, 580 250 T -60 265 Z`}
            fill={`url(#${uid}-aurora-a)`}
          />
          <path
            d={`M-40 ${115 - py * 6} Q ${410 - px * 16} 195, 760 95 T 1240 165 L 1240 245 Q 780 165, 420 235 T -40 190 Z`}
            fill={`url(#${uid}-aurora-b)`}
          />
        </svg>
      )}

      {theme.specialEffect === 'rainbow' && (
        <svg className="weather-phenomenon-svg" viewBox="0 0 1200 540" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`${uid}-rainbow`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF9E8E" stopOpacity="0.26" />
              <stop offset="32%" stopColor="#FFE082" stopOpacity="0.24" />
              <stop offset="64%" stopColor="#8CE2B2" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#82C4F8" stopOpacity="0.22" />
            </linearGradient>
          </defs>
          <path
            d={`M ${120 + px * 10} 490 A 520 390 0 0 1 ${1080 + px * 10} 490`}
            fill="none"
            stroke={`url(#${uid}-rainbow)`}
            strokeWidth="26"
            strokeLinecap="round"
          />
        </svg>
      )}

      {theme.specialEffect === 'sunbeams' && (
        <svg className="weather-phenomenon-svg" viewBox="0 0 1200 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stopColor="#FFF9DF" stopOpacity="0.24" />
              <stop offset="65%" stopColor="#FFF6D6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#FFF6D6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`${140 + px * 8},0 310,0 ${620 + px * 14},600 360,600`} fill={`url(#${uid}-beam)`} />
          <polygon points={`${440 + px * 6},0 590,0 ${910 + px * 12},600 690,600`} fill={`url(#${uid}-beam)`} />
          <polygon points={`${740 + px * 5},0 860,0 ${1140 + px * 10},600 980,600`} fill={`url(#${uid}-beam)`} />
        </svg>
      )}

      {/* 2. CELESTIAL BODIES (SUN / LOW-SUN / CRESCENT MOON) */}
      {theme.celestial === 'sun' && (
        <div
          className="weather-sun"
          style={{ transform: `translate3d(${px * -10}px, ${py * -8}px, 0)` }}
        >
          <span className="weather-sun-halo" />
          <span className="weather-sun-core" />
        </div>
      )}

      {theme.celestial === 'low-sun' && (
        <div
          className="weather-sun weather-sun-low"
          style={{ transform: `translate3d(${px * -10}px, ${py * -6}px, 0)` }}
        >
          <span className="weather-sun-halo" />
          <span className="weather-sun-core" />
        </div>
      )}

      {theme.celestial === 'moon' && (
        <div
          className="weather-moon"
          style={{ transform: `translate3d(${px * -10}px, ${py * -8}px, 0)` }}
        >
          <span className="weather-moon-halo" />
          <svg viewBox="0 0 64 64" className="weather-moon-svg">
            <path d="M39 10a22 22 0 1 0 15 38A18 18 0 0 1 39 10Z" fill="#FFF7DB" opacity="0.92" />
          </svg>
        </div>
      )}

      {/* 3. LAYERED ATMOSPHERIC CLOUDS */}
      {theme.clouds !== 'none' && (
        <div
          className={`weather-clouds weather-clouds-${theme.clouds}`}
          style={{ transform: `translate3d(${px * -14}px, ${py * -6}px, 0)` }}
        >
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

      {/* 4. SOFT DRIFTING MIST BANDS */}
      {(theme.id === 'fog' || theme.particles === 'mist' || theme.id === 'cloud-forest-rain') && (
        <div className="weather-mist-bands">
          <span className="weather-mist weather-mist-1" />
          <span className="weather-mist weather-mist-2" />
        </div>
      )}

      {/* 5. ARTISTIC BIOME LANDSCAPE ARCHETYPE SVG (WITH PARALLAX LAYERS) */}
      <svg
        key={pulseCount > 0 ? 'interactive' : 'base'}
        className="weather-landscape"
        viewBox="0 0 1200 420"
        preserveAspectRatio="xMidYMax slice"
      >
        {/* ARCHETYPE A: ALPINE PEAKS */}
        {theme.landscape === 'alpine-peaks' && (
          <>
            <g transform={`translate(${px * -8}, ${py * -4})`}>
              <path
                d="M-40 340 L140 168 L295 268 L485 134 L675 262 L875 148 L1055 248 L1240 172 L1240 420 L-40 420 Z"
                fill={theme.hillFar}
                opacity="0.62"
              />
              {/* sunlit snow/granite ridgefacets */}
              <path
                d="M140 168 L195 232 L135 245 Z M485 134 L558 214 L478 228 Z M875 148 L942 216 L868 232 Z"
                fill={theme.skyHorizon}
                opacity="0.25"
              />
            </g>
            <g transform={`translate(${px * -14}, ${py * -6})`}>
              <path
                d="M-40 356 Q 210 258, 470 306 T 980 282 L 1240 310 L 1240 420 L -40 420 Z"
                fill={theme.hillMid}
                opacity="0.82"
              />
            </g>
            {/* Pine timberline silhouettes */}
            <g transform={`translate(${px * -20}, ${py * -8})`}>
              <path
                d="M-40 368 Q 280 326, 620 348 T 1240 340 L 1240 420 L -40 420 Z"
                fill={theme.hillNear}
              />
              {[68, 112, 156, 215, 980, 1028, 1072, 1124].map((tx, i) => (
                <path
                  key={i}
                  d={`M${tx} ${304 + (i % 3) * 10} L${tx - 20} ${358 + (i % 2) * 6} L${tx + 20} ${358 + (i % 2) * 6} Z`}
                  fill={theme.foliageSilhouette}
                  opacity="0.82"
                />
              ))}
            </g>
          </>
        )}

        {/* ARCHETYPE B: FOREST CANOPY & REDWOOD GROVE */}
        {theme.landscape === 'forest-canopy' && (
          <>
            <g transform={`translate(${px * -8}, ${py * -4})`}>
              <path
                d="M-40 310 Q 250 228, 560 268 T 1240 252 L 1240 420 L -40 420 Z"
                fill={theme.hillFar}
                opacity="0.58"
              />
              {/* Distant redwood / cypress spires */}
              {[90, 145, 210, 280, 910, 975, 1045, 1115].map((tx, i) => (
                <path
                  key={i}
                  d={`M${tx} ${160 + (i % 3) * 22} L${tx - 28} 320 L${tx + 28} 320 Z`}
                  fill={theme.hillMid}
                  opacity="0.52"
                />
              ))}
            </g>
            <g transform={`translate(${px * -15}, ${py * -6})`}>
              <path
                d="M-40 344 Q 320 278, 660 316 T 1240 296 L 1240 420 L -40 420 Z"
                fill={theme.hillMid}
                opacity="0.84"
              />
            </g>
            {/* Foreground lush botanical fern & canopy silhouettes on left and right edges */}
            <g transform={`translate(${px * -22}, ${py * -8})`}>
              <path
                d="M-40 370 Q 340 330, 720 354 T 1240 346 L 1240 420 L -40 420 Z"
                fill={theme.hillNear}
              />
              <path
                d="M-20 420 Q 15 310, 128 274 Q 76 336, 92 420 Z M1220 420 Q 1185 305, 1068 270 Q 1122 336, 1106 420 Z"
                fill={theme.foliageSilhouette}
                opacity="0.76"
              />
            </g>
          </>
        )}

        {/* ARCHETYPE C: COASTAL LAGOON & COVE */}
        {theme.landscape === 'coastal-lagoon' && (
          <>
            <g transform={`translate(${px * -8}, ${py * -4})`}>
              {/* Distant island headland */}
              <path
                d="M-40 286 Q 180 212, 430 272 L 520 292 L -40 292 Z M720 292 Q 960 218, 1240 264 L 1240 292 Z"
                fill={theme.hillFar}
                opacity="0.68"
              />
            </g>
            {/* Calm lagoon water plane */}
            <rect x="-40" y="288" width="1280" height="84" fill={theme.hillMid} opacity="0.72" />
            {theme.specialEffect === 'water-shimmer' && (
              <g transform={`translate(${px * -6}, 0)`} opacity="0.38">
                <rect x="380" y="302" width="440" height="3.5" rx="1.75" fill={theme.skyHorizon} />
                <rect x="430" y="316" width="340" height="3" rx="1.5" fill={theme.skyHorizon} />
                <rect x="480" y="330" width="240" height="2.5" rx="1.25" fill={theme.skyHorizon} />
                <rect x="525" y="344" width="150" height="2" rx="1" fill={theme.skyHorizon} />
              </g>
            )}
            <g transform={`translate(${px * -18}, ${py * -7})`}>
              <path
                d="M-40 354 Q 260 322, 600 356 T 1240 342 L 1240 420 L -40 420 Z"
                fill={theme.hillNear}
              />
            </g>
          </>
        )}

        {/* ARCHETYPE D: DESERT MESA & CANYON */}
        {theme.landscape === 'desert-mesa' && (
          <>
            <g transform={`translate(${px * -8}, ${py * -4})`}>
              <path
                d="M-40 328 L 95 256 L 265 256 L 335 316 L 680 318 L 755 242 L 965 242 L 1045 312 L 1240 312 L 1240 420 L -40 420 Z"
                fill={theme.hillFar}
                opacity="0.68"
              />
            </g>
            <g transform={`translate(${px * -14}, ${py * -6})`}>
              <path
                d="M-40 352 Q 290 296, 610 330 T 1240 316 L 1240 420 L -40 420 Z"
                fill={theme.hillMid}
                opacity="0.84"
              />
            </g>
            <g transform={`translate(${px * -20}, ${py * -8})`}>
              <path
                d="M-40 374 Q 360 342, 740 364 T 1240 356 L 1240 420 L -40 420 Z"
                fill={theme.hillNear}
              />
            </g>
          </>
        )}

        {/* ARCHETYPE E: BOTANICAL GLASSHOUSE ARCH & TERRACE */}
        {theme.landscape === 'botanical-arch' && (
          <>
            <g transform={`translate(${px * -6}, ${py * -3})`} opacity="0.22">
              <path
                d="M 80 420 L 80 140 Q 600 -20, 1120 140 L 1120 420"
                fill="none"
                stroke={theme.skyHorizon}
                strokeWidth="2.5"
              />
              <path
                d="M 220 420 L 220 165 Q 600 35, 980 165 L 980 420"
                fill="none"
                stroke={theme.skyHorizon}
                strokeWidth="1.5"
              />
            </g>
            <g transform={`translate(${px * -10}, ${py * -4})`}>
              <path
                d="M-40 322 Q 260 264, 560 296 T 1240 288 L 1240 420 L -40 420 Z"
                fill={theme.hillFar}
                opacity="0.62"
              />
            </g>
            <g transform={`translate(${px * -16}, ${py * -6})`}>
              <path
                d="M-40 350 Q 320 304, 660 334 T 1240 322 L 1240 420 L -40 420 Z"
                fill={theme.hillMid}
                opacity="0.82"
              />
            </g>
            <g transform={`translate(${px * -22}, ${py * -8})`}>
              <path
                d="M-40 374 Q 360 344, 720 364 T 1240 358 L 1240 420 L -40 420 Z"
                fill={theme.hillNear}
              />
            </g>
          </>
        )}

        {/* ARCHETYPE F: ROLLING BOTANICAL MEADOW (DEFAULT) */}
        {theme.landscape === 'rolling-meadow' && (
          <>
            <g transform={`translate(${px * -8}, ${py * -4})`}>
              <path
                d="M-40 316 Q 260 252, 560 286 T 1240 278 L 1240 420 L -40 420 Z"
                fill={theme.hillFar}
                opacity="0.6"
              />
            </g>
            <g transform={`translate(${px * -14}, ${py * -6})`}>
              <path
                d="M-40 346 Q 320 296, 660 328 T 1240 318 L 1240 420 L -40 420 Z"
                fill={theme.hillMid}
                opacity="0.8"
              />
            </g>
            <g transform={`translate(${px * -20}, ${py * -8})`}>
              <path
                d="M-40 372 Q 360 340, 720 360 T 1240 356 L 1240 420 L -40 420 Z"
                fill={theme.hillNear}
              />
            </g>
          </>
        )}

        {/* Soft ambient ground pool beneath the plant companion */}
        <ellipse
          cx={600 + px * -18}
          cy="408"
          rx="520"
          ry="52"
          fill={theme.groundTint}
          opacity="0.32"
        />
      </svg>
    </div>
  );
}
