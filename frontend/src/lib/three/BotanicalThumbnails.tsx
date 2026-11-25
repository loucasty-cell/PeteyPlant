import { useState } from 'react';
import { resolveSpeciesAsset } from './speciesAssetRegistry';

export interface BotanicalThumbnailProps {
  speciesId: string | null | undefined;
  size?: number;
  className?: string;
  label?: string;
  preferRender?: boolean;
}

/**
 * Lightweight species-specific SVG botanical thumbnails for all 8 flagship
 * companions. Used across My Garden cards, search pickers, Care rows, and
 * WebGL-unavailable static fallbacks so we never spin up a live WebGL canvas
 * per list card.
 */
export function BotanicalThumbnail({
  speciesId,
  size = 64,
  className = '',
  label,
  preferRender = false,
}: BotanicalThumbnailProps) {
  const { entry } = resolveSpeciesAsset(speciesId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (preferRender && entry.thumbnailUrl && failedUrl !== entry.thumbnailUrl) {
    return (
      <img
        src={entry.thumbnailUrl}
        alt={label ?? ''}
        width={size}
        height={size}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(entry.thumbnailUrl)}
      />
    );
  }
  const v = entry.proceduralVariantIndex;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect width="96" height="96" rx="16" fill="#F2F4EC" />

      {/* Ground shadow */}
      <ellipse cx="48" cy="83" rx="22" ry="4.5" fill="#234D36" fillOpacity="0.12" />

      {/* Species-specific botanical foliage silhouette */}
      {v === 0 && (
        /* Monstera deliciosa: fenestrated broad heart leaves */
        <g stroke="#234D36" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M48 61 L48 44" strokeWidth="3" />
          <path d="M47 56 C39 50 28 53 23 44 C20 38 25 36 28 35 C24 33 23 26 32 23 C43 20 48 31 48 45 Z" fill="#3B7A50" />
          <path d="M49 56 C56 50 67 52 72 44 C75 38 71 34 67 34 C71 31 71 24 62 22 C52 20 48 32 48 46 Z" fill="#52915B" />
          <path d="M48 44 C44 35 45 24 52 18 C57 25 56 36 48 44 Z" fill="#A7C98B" />
          <path d="M47 50 C41 42 36 36 30 33" stroke="#1E3F2C" strokeWidth="1.8" />
          <path d="M49 50 C55 43 60 38 66 35" stroke="#1E3F2C" strokeWidth="1.8" />
        </g>
      )}

      {v === 1 && (
        /* Epipremnum aureum (Golden Pothos): cascading trailing vines & variegated hearts */
        <g stroke="#234D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M48 58 C36 52 24 56 20 71" fill="none" strokeWidth="2.6" />
          <path d="M48 58 C60 51 73 56 76 72" fill="none" strokeWidth="2.6" />
          <path d="M48 56 C44 43 34 33 26 37 C22 43 32 51 44 50 Z" fill="#5C8D44" />
          <path d="M48 55 C54 41 64 31 71 36 C74 42 63 50 51 49 Z" fill="#77A348" />
          <path d="M48 54 C42 40 43 27 49 23 C56 28 55 41 48 54 Z" fill="#A7C98B" />
          <path d="M23 61 C17 62 15 69 21 73 C26 71 27 65 23 61 Z" fill="#B8CD6D" />
          <path d="M74 63 C79 64 80 71 74 75 C69 72 69 66 74 63 Z" fill="#A7C98B" />
        </g>
      )}

      {v === 2 && (
        /* Dracaena trifasciata (Snake Plant): upright stiff sword blades with banding */
        <g stroke="#234D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M37 60 C35 44 33 30 37 19 C42 29 43 44 43 60 Z" fill="#3D6D4B" />
          <path d="M53 60 C55 43 58 29 55 18 C49 28 48 44 48 60 Z" fill="#4D7E52" />
          <path d="M43 60 C43 40 45 24 48 13 C52 24 53 40 52 60 Z" fill="#6B985E" />
          <path d="M31 60 C27 48 27 36 31 28 C35 36 37 48 37 60 Z" fill="#2E583D" />
          <path d="M62 60 C66 47 67 35 63 26 C58 35 56 47 56 60 Z" fill="#3A6647" />
          <path d="M45 28 H51 M44 37 H52 M44 46 H52" stroke="#D7CE78" strokeWidth="1.8" />
        </g>
      )}

      {v === 3 && (
        /* Chlorophytum comosum (Spider Plant): arching ribbon fountain + hanging spiderette */
        <g stroke="#234D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M48 59 C41 42 28 32 16 37 C26 39 36 47 44 60 Z" fill="#528A54" />
          <path d="M48 59 C55 42 68 32 80 37 C70 39 60 47 52 60 Z" fill="#528A54" />
          <path d="M48 59 C44 38 35 23 24 21 C34 27 42 40 46 60 Z" fill="#77AC67" />
          <path d="M48 59 C52 38 61 23 72 21 C62 27 54 40 50 60 Z" fill="#77AC67" />
          <path d="M48 59 C46 37 46 21 48 15 C50 21 50 37 48 59 Z" fill="#A7C98B" />
          {/* Arching stolon + baby spiderette */}
          <path d="M51 54 C64 42 78 48 77 65" fill="none" stroke="#8FB068" strokeWidth="1.8" />
          <path d="M77 65 L72 71 M77 65 L82 71 M77 65 L77 73" stroke="#4D8751" strokeWidth="2.2" />
        </g>
      )}

      {v === 4 && (
        /* Aloe vera: thick fleshy serrated rosette spears */
        <g stroke="#234D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M41 60 C31 50 23 39 20 29 C28 35 37 45 45 59 Z" fill="#467E62" />
          <path d="M55 60 C65 50 73 39 76 29 C68 35 59 45 51 59 Z" fill="#467E62" />
          <path d="M43 60 C37 44 35 29 36 18 C43 27 47 42 48 59 Z" fill="#5E9C77" />
          <path d="M53 60 C59 44 61 29 60 18 C53 27 49 42 48 59 Z" fill="#5E9C77" />
          <path d="M44 60 C44 44 46 27 48 16 C50 27 52 44 52 60 Z" fill="#82B68E" />
        </g>
      )}

      {v === 5 && (
        /* Dypsis lutescens (Areca Palm): clustered canes & feathery pinnate fronds */
        <g stroke="#234D36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M45 60 L41 36 M48 60 L48 24 M51 60 L55 36" stroke="#7A9A58" strokeWidth="2.6" />
          {/* Left frond leaflets */}
          <path d="M41 36 C32 30 22 30 16 35" fill="none" stroke="#397246" strokeWidth="2.4" />
          <path d="M37 34 L31 25 M32 32 L25 25 M27 32 L20 28 M35 35 L29 41 M28 34 L22 41" stroke="#4D8C53" strokeWidth="2.2" />
          {/* Center frond leaflets */}
          <path d="M48 24 L48 14" stroke="#397246" strokeWidth="2.4" />
          <path d="M48 28 L39 20 M48 28 L57 20 M48 22 L40 15 M48 22 L56 15" stroke="#6BA35F" strokeWidth="2.2" />
          {/* Right frond leaflets */}
          <path d="M55 36 C64 30 74 30 80 35" fill="none" stroke="#397246" strokeWidth="2.4" />
          <path d="M59 34 L65 25 M64 32 L71 25 M69 32 L76 28 M61 35 L67 41 M68 34 L74 41" stroke="#4D8C53" strokeWidth="2.2" />
        </g>
      )}

      {v === 6 && (
        /* Goeppertia makoyana (Peacock Plant): patterned ovals + plum undersides */
        <g stroke="#234D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 60 L35 44 M48 60 L48 34 M50 60 L61 44" stroke="#6B3C4E" strokeWidth="2.4" />
          <ellipse cx="30" cy="39" rx="12" ry="15" transform="rotate(-24 30 39)" fill="#6C3B4E" />
          <ellipse cx="66" cy="39" rx="12" ry="15" transform="rotate(24 66 39)" fill="#628C5C" />
          <ellipse cx="48" cy="29" rx="12" ry="16" fill="#A7C98B" />
          <path d="M48 17 V41 M43 24 L48 28 L53 24 M42 32 L48 35 L54 32" stroke="#234D36" strokeWidth="1.8" />
        </g>
      )}

      {v === 7 && (
        /* Ficus lyrata (Fiddle-Leaf Fig): woody trunk + violin-shaped leaves */
        <g stroke="#234D36" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M48 61 L48 33" stroke="#6F533D" strokeWidth="4.2" />
          <path d="M48 47 C38 45 27 49 23 41 C20 34 27 30 32 30 C37 30 43 36 48 44 Z" fill="#3B6E47" />
          <path d="M48 45 C58 43 69 47 73 39 C76 32 69 28 64 28 C59 28 53 34 48 42 Z" fill="#4A8054" />
          <path d="M48 37 C40 31 39 20 48 15 C57 20 56 31 48 37 Z" fill="#639864" />
          <path d="M48 18 V35" stroke="#A7C98B" strokeWidth="1.6" />
        </g>
      )}

      {/* Ceramic pot with subtle Petey face */}
      <path
        d="M32 64 L35.5 77.5 C36.4 80.6 39.2 82.5 42.5 82.5 L53.5 82.5 C56.8 82.5 59.6 80.6 60.5 77.5 L64 64 Z"
        fill="#FFFFFF"
        stroke="#234D36"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <rect
        x="29"
        y="58.5"
        width="38"
        height="6.5"
        rx="3.25"
        fill="#F7F6EF"
        stroke="#234D36"
        strokeWidth="2.8"
      />
      <rect x="40.5" y="70" width="3" height="5.2" rx="1.5" fill="#234D36" />
      <rect x="52.5" y="70" width="3" height="5.2" rx="1.5" fill="#234D36" />
      <path d="M45.5 73.8 Q48 76.5 50.5 73.8" stroke="#234D36" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
