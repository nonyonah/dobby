/**
 * Clerk's `appearance` prop — geometry and typography only.
 *
 * Colors are deliberately absent so sign-in/sign-up keep Clerk's stock
 * palette. This file only reconciles shape and sizing with the app:
 *
 *  - anything you would tap or type into takes `6px`, which is `--radius-md`
 *    (the base-mira `rounded-md` the rest of the app uses), never a pill
 *  - field, button and card metrics mirror `components/ui/*` so a Clerk screen
 *    lines up with ours without inheriting our color scheme
 */
type ClerkAppearance = ClerkAppearanceRegistry["theme"];

const clerkAppearance: ClerkAppearance = {
  variables: {
    fontFamily: "var(--font-sans)",
    fontSize: "13px",

    borderRadius: "12px",
  },

  elements: {
    /*
     * `card` paints its own border and radius; `cardBox` is the elevation
     * wrapper around it. Splitting their radii keeps a single edge — Clerk
     * offsets `card` by -1px specifically to overlap the wrapper's edge.
     */
    cardBox: {
      borderRadius: "16px",
    },
    card: {
      borderRadius: "16px",
    },
    header: { gap: "6px" },
    headerTitle: {
      fontSize: "17px",
      fontWeight: "600",
      letterSpacing: "-0.01em",
    },
    headerSubtitle: {
      fontSize: "13px",
    },

    /* Primary CTA — Input is h-8 / 13px, so the submit matches it. */
    formButtonPrimary: {
      borderRadius: "6px",
      height: "32px",
      minHeight: "32px",
      padding: "0 16px",
      fontSize: "13px",
      fontWeight: "500",
      textTransform: "none",
      letterSpacing: "normal",
      transition: "background-color 150ms, opacity 150ms",
      "&:disabled": { opacity: "0.5", cursor: "not-allowed" },
    },

    /* "Use another method" / back links that render as buttons. */
    formButtonReset: {
      borderRadius: "6px",
      height: "32px",
      minHeight: "32px",
      padding: "0 16px",
      fontSize: "13px",
      fontWeight: "500",
      textTransform: "none",
      transition: "background-color 150ms, color 150ms",
    },

    /* OAuth buttons — same block geometry as the primary. */
    socialButtonsBlockButton: {
      borderRadius: "6px",
      height: "32px",
      minHeight: "32px",
      fontSize: "13px",
      fontWeight: "500",
      textTransform: "none",
      transition: "background-color 150ms, border-color 150ms",
    },
    socialButtonsIconButton: {
      borderRadius: "6px",
      transition: "background-color 150ms, border-color 150ms",
    },

    /* "Use another method" — a real button, so it takes the same shape. */
    alternativeMethodsBlockButton: {
      borderRadius: "6px",
      height: "32px",
      minHeight: "32px",
      padding: "0 16px",
      fontSize: "13px",
      fontWeight: "500",
      textTransform: "none",
      transition: "background-color 150ms, border-color 150ms",
    },

    headerBackLink: {
      fontSize: "13px",
      "&:hover": { textDecoration: "underline" },
    },
    backLink: {
      fontSize: "13px",
      "&:hover": { textDecoration: "underline" },
    },

    /* Field — mirrors components/ui/input.tsx metrics. */
    formFieldInput: {
      borderRadius: "6px",
      height: "32px",
      minHeight: "32px",
      fontSize: "13px",
      padding: "0 12px",
      transition: "border-color 150ms",
      "&:disabled": { opacity: "0.5", cursor: "not-allowed" },
    },
    formFieldLabel: {
      fontSize: "12px",
      fontWeight: "500",
    },
    formFieldHintText: { fontSize: "12px" },
    formFieldErrorText: { fontSize: "12px" },
    formFieldSuccessText: { fontSize: "12px" },
    formFieldAction: {
      fontSize: "12px",
      fontWeight: "500",
      "&:hover": { textDecoration: "underline" },
    },

    /* OTP cells are text inputs, so they take the same 6px as formFieldInput. */
    otpCodeFieldInputContainer: {
      borderRadius: "6px",
      transition: "border-color 150ms",
    },
    otpCodeFieldInput: {
      fontSize: "15px",
      fontWeight: "500",
    },

    footerAction: { marginTop: "4px" },
    footerActionText: { fontSize: "13px" },
    footerActionLink: {
      fontSize: "13px",
      fontWeight: "500",
      "&:hover": { textDecoration: "underline" },
    },
    footer: { fontSize: "12px" },

    /* Inline error banner. */
    alert: {
      borderRadius: "12px",
    },
    alertText: { fontSize: "12px" },

    identityPreview: {
      borderRadius: "6px",
    },
    identityPreviewEditButton: {
      "&:hover": { textDecoration: "underline" },
    },
  },
};

export { clerkAppearance };
export type { ClerkAppearance };
