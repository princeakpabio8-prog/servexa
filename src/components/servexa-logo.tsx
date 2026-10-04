// @ts-nocheck
/**
 * ServexaLogo — renders the official SERVEXA brand mark as a crisp SVG.
 *
 * Variants:
 *   "full"     — S-symbol + SERVEXA wordmark + tagline  (default)
 *   "wordmark" — S-symbol + SERVEXA wordmark (no tagline)
 *   "symbol"   — S-symbol only
 *
 * The `width` prop scales the entire logo while preserving the original
 * proportions.  The natural (100%) dimensions are:
 *   full     : 520 × 140
 *   wordmark : 400 × 100
 *   symbol   : 110 × 130
 */

import Svg, {
  Circle,
  G,
  Path,
  Text as SvgText,
} from 'react-native-svg';

type Variant = 'full' | 'wordmark' | 'symbol';

interface Props {
  /** Rendered width in dp/px; height is computed automatically. */
  width?: number;
  variant?: Variant;
}

// ── Brand colours (sampled from the provided logo) ────────────────────────
const TEAL_DARK   = '#1E5C4E'; // S-symbol body + tagline text
const TEAL_MID    = '#3D7A68'; // large interior dot
const TEAL_LIGHT  = '#82B9A8'; // small interior dot
const INK         = '#1A1F2E'; // SERVEXA wordmark

// ── Natural viewport for each variant ─────────────────────────────────────
const VIEWBOXES: Record<Variant, { vw: number; vh: number }> = {
  full:     { vw: 520, vh: 140 },
  wordmark: { vw: 400, vh: 100 },
  symbol:   { vw: 110, vh: 130 },
};

const DEFAULT_WIDTHS: Record<Variant, number> = {
  full:     260,
  wordmark: 160,
  symbol:   44,
};

/**
 * The S-shaped symbol path — drawn inside a 110 × 130 viewBox.
 *
 * The shape is a continuous open-path S-curve with rounded stroke caps,
 * closely matching the official logo geometry.  We use a thick stroke
 * so it renders correctly at any size.
 */
function SymbolMark() {
  return (
    <G>
      {/* ── S-curve body ──────────────────────────────────────────────── */}
      {/*
        The S is drawn as a single cubic-bezier path with a rounded
        open stroke.  Coordinates are tuned to the 110×130 canvas.
      */}
      <Path
        d={[
          // Start: bottom-left terminal of the S (lower curve end)
          'M 22 108',
          // Lower-S arc: sweeps right and up
          'C 22 90, 88 90, 88 72',
          // Mid inflection
          'C 88 54, 22 54, 22 36',
          // Upper-S arc: sweeps right and up to top-right terminal
          'C 22 18, 88 18, 88 22',
        ].join(' ')}
        stroke={TEAL_DARK}
        strokeWidth={16}
        strokeLinecap="round"
        fill="none"
      />

      {/* ── Two interior accent dots ────────────────────────────────── */}
      {/* Larger dot — upper-left of centre */}
      <Circle cx={44} cy={60} r={8.5} fill={TEAL_MID} />
      {/* Smaller dot — lower-right of centre */}
      <Circle cx={60} cy={72} r={6}   fill={TEAL_LIGHT} />
    </G>
  );
}

export default function ServexaLogo({
  width,
  variant = 'full',
}: Props) {
  const { vw, vh } = VIEWBOXES[variant];
  const resolvedWidth  = width ?? DEFAULT_WIDTHS[variant];
  const resolvedHeight = (resolvedWidth / vw) * vh;

  return (
    <Svg
      width={resolvedWidth}
      height={resolvedHeight}
      viewBox={`0 0 ${vw} ${vh}`}
      accessibilityLabel="SERVEXA"
      accessibilityRole="image"
    >
      {variant === 'symbol' ? (
        // ── Symbol-only mode: full 110×130 canvas ─────────────────────
        <SymbolMark />
      ) : variant === 'wordmark' ? (
        // ── Wordmark mode: symbol (scaled to 78 px tall) + text ───────
        <G>
          {/* Symbol scaled to fit 78px height inside 100px canvas */}
          <G transform="translate(0, 11) scale(0.6)">
            <SymbolMark />
          </G>

          {/* SERVEXA wordmark */}
          <SvgText
            x={78}
            y={58}
            fill={INK}
            fontSize={44}
            fontWeight="800"
            letterSpacing={3}
            fontFamily="System"
          >
            SERVEXA
          </SvgText>
        </G>
      ) : (
        // ── Full mode: symbol + wordmark + tagline ────────────────────
        <G>
          {/* Symbol scaled to 110px tall inside 140px canvas */}
          <G transform="translate(0, 15) scale(0.846)">
            <SymbolMark />
          </G>

          {/* SERVEXA wordmark */}
          <SvgText
            x={102}
            y={72}
            fill={INK}
            fontSize={56}
            fontWeight="800"
            letterSpacing={3}
            fontFamily="System"
          >
            SERVEXA
          </SvgText>

          {/* Tagline */}
          <SvgText
            x={104}
            y={104}
            fill={TEAL_DARK}
            fontSize={11.5}
            fontWeight="600"
            letterSpacing={2.8}
            fontFamily="System"
          >
            CUSTOMER CARE THAT FOLLOWS THROUGH
          </SvgText>
        </G>
      )}
    </Svg>
  );
}
