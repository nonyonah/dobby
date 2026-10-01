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

/**
 * The squircle tile at `/dobby-logo-squircle.svg` is the artwork that ships, so
 * it is the default rather than an on-error fallback. Pointing `src` at a raster
 * that may not exist makes the browser 404 first and swap afterwards, which
 * reads as a broken image on every load.
 *
 * The shape is a true continuous-corner squircle (superellipse, n=5) drawn as an
 * SVG path, not a `border-radius`. A radius can only round the corners; the
 * squircle's curvature continues into the edges, which is what makes it read as
 * an app icon at 16px. The same file backs the favicon, so the tab and the
 * sidebar are the same mark at two sizes.
 */
const DEFAULT_SRC = "/dobby-logo-squircle.svg";

/**
 * The Dobby mascot, centred in a square box with `object-contain` so it never
 * crops or drifts off-centre at any size — sidebar header, onboarding,
 * anywhere the brand shows.
 */
export function BrandLogo({ size = 32, className, src = DEFAULT_SRC }: BrandLogoProps) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        decoding="async"
        className="block size-full object-contain"
        style={{ objectPosition: "center" }}
      />
    </span>
  );
}
