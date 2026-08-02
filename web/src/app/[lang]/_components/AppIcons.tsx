import type { SVGProps } from "react";

/**
 * Marks taken verbatim from the app's own icon set, so the panel and the
 * product point at the same thing with the same drawing. Lucide covers
 * everything generic; these are the ones where the app has a glyph of its own
 * and a stand-in would be a second, competing mark for one idea.
 *
 * Ported rather than shared: the app's icons are `react-native-svg`, which the
 * web cannot import. The path data is copied exactly (`mobile/src/components/
 * icons.tsx`) and must be re-copied if the app redraws one — that is the cost
 * of the two runtimes, and a drawn mark drifting is more visible than a
 * duplicated constant.
 */

type IconProps = SVGProps<SVGSVGElement>;

/**
 * CIRCLES — two overlapping arcs, the app's `GroupsIcon`. It mirrors under RTL
 * exactly as it does in the app: the two arcs are not symmetric, so the pair
 * has a reading order and it follows the language.
 *
 * `strokeWidth` is the app's `STROKE.base` (2) against its 24-unit viewBox, so
 * the weight matches the Lucide tabs beside it, which are drawn the same way.
 */
export function CirclesIcon({ className, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className ? `${className} rtl:-scale-x-100` : "rtl:-scale-x-100"}
      {...rest}
    >
      <path d="M 7.43 16.02 A 6.7 6.7 0 1 1 13.27 15.42" />
      <path d="M 18.62 11.27 A 5.3 5.3 0 1 1 14.02 10.63" />
    </svg>
  );
}
