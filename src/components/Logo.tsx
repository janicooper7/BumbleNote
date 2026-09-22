import Image from 'next/image'

// The lockup is a stacked mark (bee above the wordmark), not a wide side-by-side
// lockup — it's drawn to a 112 x 64 box. The asset ships at 3x that (336 x 192)
// and is served unoptimized: Next 16 pins `quality` to an allowlist (default
// [75]), and a lossy pass at that setting rings around the wordmark's hard dark
// edges. A palette PNG of flat artwork is both sharper and smaller here.
const BOX = { width: 112, height: 64 }
const RATIO = BOX.width / BOX.height

/**
 * The BumbleNote lockup — bee + wordmark. It carries the product name, so it is
 * labelled rather than decorative; callers should not set the name in type next
 * to it.
 *
 * `tone="light"` swaps in the variant whose wordmark is cream. The stock
 * wordmark is brown and disappears on the dark panels.
 */
export default function Logo({
  height = BOX.height,
  tone = 'dark',
  className = '',
}: {
  height?: number
  tone?: 'dark' | 'light'
  className?: string
}) {
  const width = Math.round(height * RATIO)
  return (
    <Image
      src={tone === 'light' ? '/logo-lockup-light.png' : '/logo-lockup.png'}
      alt='BumbleNote'
      width={width}
      height={height}
      preload
      unoptimized
      className={className}
      style={{ width, height }}
    />
  )
}

/**
 * The bee on its own, square. For tight spots where the wordmark can't fit —
 * the browser icons are generated from the same crop.
 */
export function LogoMark({
  size = 34,
  className = '',
}: {
  size?: number
  className?: string
}) {
  const px = Math.round(size * 1.25)
  return (
    <Image
      src='/logo-mark.png'
      alt=''
      aria-hidden
      width={px}
      height={px}
      className={className}
      style={{ width: px, height: px }}
    />
  )
}
