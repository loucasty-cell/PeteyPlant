import type { CSSProperties } from 'react';

export interface PeteyLogoProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  variant?: 'color' | 'light' | 'monochrome';
}

/**
 * Primary Petey Plant brand mark.
 * Preserves the exact silhouette, fenestrated leaf composition, basal leaves,
 * crown sprout, and smiling ceramic pot proportions of the provided logo asset.
 */
export function PeteyLogo({
  size = 36,
  className = '',
  style,
  title,
  variant = 'color',
}: PeteyLogoProps) {
  const stroke = variant === 'light' ? '#F7F6EF' : '#234D36';
  const leafMain = variant === 'light' ? '#A7C98B' : variant === 'monochrome' ? '#234D36' : '#A4D43C';
  const leafBasal = variant === 'light' ? '#8CB46E' : variant === 'monochrome' ? '#234D36' : '#8EC238';
  const potFill = variant === 'light' ? '#173424' : variant === 'monochrome' ? '#FFFFFF' : '#FFFFFF';
  const faceColor = variant === 'light' ? '#F7F6EF' : '#234D36';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}

      {/* Top central sprout leaf */}
      <path
        d="M60 44 C53.5 36 53.5 26.5 62.5 18.5 C69.5 26 68.5 36 60 44 Z"
        fill={leafMain}
        stroke={stroke}
        strokeWidth="4.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M60.2 41 C60.5 34.5 61.5 29.5 62.2 25.5"
        stroke={stroke}
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Left large fenestrated monstera leaf */}
      <path
        d="M57.5 67
           C53 60 44 61 38 60
           C33.5 59.2 33 55 37.5 50.5
           C39.5 48.5 36.5 46.8 33 49.5
           C28 53 22 50 22.5 44.5
           C23 40.5 27.5 38.5 30.5 37
           C27.5 35 23.5 36 21 38.5
           C19 32 24 23 35.5 23.5
           C48.5 24 57 35 58.5 52 Z"
        fill={leafMain}
        stroke={stroke}
        strokeWidth="4.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M56.5 60 C52 49 46 41 37 35"
        stroke={stroke}
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Right large fenestrated monstera leaf */}
      <path
        d="M61 68
           C65.5 61.5 72 63 77.5 61.5
           C80.5 60.5 81 57.5 80 55
           C85.5 55.5 93 52 96 45
           C99 38.5 96.5 32 89.5 31
           C86 30.5 82.5 33.5 81.5 35
           C79 34.5 79.5 30.5 83.5 27.5
           C77 24.5 66.5 27.5 62.5 39
           C60 46 60 56 61 68 Z"
        fill={leafMain}
        stroke={stroke}
        strokeWidth="4.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M61.5 63 C66 52 73 45 84 42"
        stroke={stroke}
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Left basal leaf */}
      <path
        d="M56 76
           C50 71 44 64 35.5 64
           C29.5 64 26 67 24 68.5
           C29 70 31.5 76.5 38 77.5
           C44 78.5 50 74.5 55 78 Z"
        fill={leafBasal}
        stroke={stroke}
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M53 75.5 C46.5 71 41.5 69.5 36 69.5"
        stroke={stroke}
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Right basal leaf */}
      <path
        d="M62.5 77.5
           C68 74 74 79 80 78
           C86 77 88.5 71 92.5 69.5
           C89 67.5 86 66 80 67
           C72 68 66.5 71.5 62.5 77.5 Z"
        fill={leafBasal}
        stroke={stroke}
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M65.5 76 C71.5 72.5 76.5 71.8 82 72"
        stroke={stroke}
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* Central stem joining pot */}
      <path
        d="M59 56 L59 80"
        stroke={stroke}
        strokeWidth="4.8"
        strokeLinecap="round"
      />

      {/* Pot body */}
      <path
        d="M39.5 87 L43.5 103 C44.8 107.8 48.8 110.5 54 110.5 L66 110.5 C71.2 110.5 75.2 107.8 76.5 103 L80.5 87 Z"
        fill={potFill}
        stroke={stroke}
        strokeWidth="4.4"
        strokeLinejoin="round"
      />

      {/* Pot rim collar */}
      <rect
        x="35.5"
        y="79.5"
        width="49"
        height="9.5"
        rx="4.75"
        fill={potFill}
        stroke={stroke}
        strokeWidth="4.4"
        strokeLinejoin="round"
      />

      {/* Cute eyes + smile */}
      <rect x="49.5" y="94.5" width="4.2" height="8" rx="2.1" fill={faceColor} />
      <rect x="66.3" y="94.5" width="4.2" height="8" rx="2.1" fill={faceColor} />
      <path
        d="M57 99.8 Q60 103.8 63 99.8"
        stroke={faceColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Encoded SVG data URI for <link rel="icon"> matching the Petey Plant logo.
 */
export const PETEY_FAVICON_DATA_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
      '<rect width="120" height="120" rx="28" fill="#F7F6EF"/>' +
      '<path d="M60 44 C53.5 36 53.5 26.5 62.5 18.5 C69.5 26 68.5 36 60 44 Z" fill="#A4D43C" stroke="#234D36" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M57.5 67 C53 60 44 61 38 60 C33.5 59.2 33 55 37.5 50.5 C39.5 48.5 36.5 46.8 33 49.5 C28 53 22 50 22.5 44.5 C23 40.5 27.5 38.5 30.5 37 C27.5 35 23.5 36 21 38.5 C19 32 24 23 35.5 23.5 C48.5 24 57 35 58.5 52 Z" fill="#A4D43C" stroke="#234D36" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M61 68 C65.5 61.5 72 63 77.5 61.5 C80.5 60.5 81 57.5 80 55 C85.5 55.5 93 52 96 45 C99 38.5 96.5 32 89.5 31 C86 30.5 82.5 33.5 81.5 35 C79 34.5 79.5 30.5 83.5 27.5 C77 24.5 66.5 27.5 62.5 39 C60 46 60 56 61 68 Z" fill="#A4D43C" stroke="#234D36" stroke-width="5" stroke-linejoin="round"/>' +
      '<path d="M39.5 87 L43.5 103 C44.8 107.8 48.8 110.5 54 110.5 L66 110.5 C71.2 110.5 75.2 107.8 76.5 103 L80.5 87 Z" fill="#FFFFFF" stroke="#234D36" stroke-width="5" stroke-linejoin="round"/>' +
      '<rect x="35.5" y="79.5" width="49" height="9.5" rx="4.75" fill="#FFFFFF" stroke="#234D36" stroke-width="5"/>' +
      '<rect x="49.5" y="94.5" width="4.5" height="8" rx="2.2" fill="#234D36"/>' +
      '<rect x="66" y="94.5" width="4.5" height="8" rx="2.2" fill="#234D36"/>' +
      '<path d="M57 99.8 Q60 103.8 63 99.8" stroke="#234D36" stroke-width="3.5" stroke-linecap="round" fill="none"/>' +
      '</svg>',
  );
