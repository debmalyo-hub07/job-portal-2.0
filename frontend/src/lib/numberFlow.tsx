import NumberFlow, { useIsSupported } from "@number-flow/react";

/**
 * A number that animates when it changes.
 *
 * Wrapped for the same reason `lib/motion.tsx` wraps framer-motion: the
 * composable is what honours `prefers-reduced-motion`, so a page reaching for
 * the library directly is how a surface quietly stops honouring it.
 * `reveal.test.tsx` enforces that — only modules under `src/lib` may import
 * either package.
 *
 * `respectMotionPreference` is passed explicitly even though it is the library's
 * default. A default is a decision made in someone else's release notes; a
 * version bump that flipped it would take the reduced-motion contract with it
 * and nothing here would read differently.
 *
 * Use it where a number is genuinely *feedback* — a result count that responds
 * to a filter, a dashboard figure that moves on a refetch. Tier 3, in the
 * project's vocabulary, which is why it survives every motion tier including the
 * workspace's `response`. A number that only ever renders once has nothing to
 * animate, and wrapping it buys a web component for no motion at all.
 *
 * The element is a custom element with a declarative shadow root. In jsdom it
 * renders a plain `<span>` fallback plus the shadow `<template>` — which means
 * its injected `<style>` text shows up in `textContent`, so a test asserting on
 * a whole subtree's text near one of these will see CSS. Query the number, not
 * the container.
 */
export function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const supported = useIsSupported();

  // The library's own capability check, used as a degradation ladder in the
  // shape `Atmosphere` uses for WebGL. It is not defensive decoration: without
  // it, a value change in an environment where the custom element never
  // upgraded throws `this.el?.willUpdate is not a function` and takes the whole
  // subtree down. jsdom is one such environment, so every test that filters a
  // list and re-renders its count would have crashed — but so is any browser
  // that ships without the CSS features `number-flow` needs, and there the
  // result would be a blank page on a filter change rather than a failing test.
  if (!supported) {
    return <span className={className}>{value.toLocaleString()}</span>;
  }

  return (
    <NumberFlow
      value={value}
      className={className}
      respectMotionPreference
      // Counts are whole. Without this a locale that would render a decimal
      // separator gets one, and "1,234 results" becoming "1,234.0" is a
      // formatting bug that only appears in some locales.
      format={{ maximumFractionDigits: 0 }}
    />
  );
}
