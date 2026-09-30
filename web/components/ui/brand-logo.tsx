"use client";

import * as React from "react";
import { cn } from "cn";

export interface BrandLogoProps {
  /** Rendered box size in px; the mascot is centred inside it. */
  size?: number;
  className?: string;
  /** Override the artwork path. */
  src?: string;
}

const FALLBACK = "/dobby-logo.svg";

/**
 * The Dobby mascot, centred in a square box with `object-contain` so it never
 * crops or drifts off-centre at any size — sidebar header, onboarding, favicon
 * artwork, anywhere the brand shows.
 *
 * Defaults to the PNG at `/dobby-logo.png` and falls back to the vector
 * `/dobby-logo.svg` if it is absent, so dropping in the raster asset needs no
 * code change.
 */
export function BrandLogo({ size = 32, className, src = "/dobby-logo.png" }: BrandLogoProps) {
  const [source, setSource] = React.useState(src);
  React.useEffect(() => {
    setSource(src);
  }, [src]);

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        onError={() => {
          if (source !== FALLBACK) setSource(FALLBACK);
        }}
        className="block size-full object-contain"
        style={{ objectPosition: "center" }}
      />
    </span>
  );
}
