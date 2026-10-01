import * as React from "react";
import { Body, Container, Head, Html, Preview, Section } from "@react-email/components";
import { fonts, radius, spacing, tokens, type Tone } from "./tokens.js";

/**
 * Shared shell for every Dobby email.
 *
 * One definition of the surface, the accent and the dark-mode override, so the
 * templates differ only in what they say. Dark mode overrides the same custom
 * properties inside a `prefers-color-scheme` block — the email equivalent of the
 * app's `.dark` token block, and the reason one template serves both schemes.
 *
 * The page is flat: no shadow, one hairline border, like every surface in the
 * product.
 */
export function Layout({ preview, children }: { preview: string; children: React.ReactNode }) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{darkModeCss}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.page}>{children}</Container>
      </Body>
    </Html>
  );
}

/**
 * The single call to action. One per email by design — two buttons is how a
 * transactional template ends up with none that get pressed.
 */
export function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={styles.ctaRow}>
      <a href={href} style={styles.cta}>
        {children}
      </a>
    </Section>
  );
}

/**
 * The number the email is about, in the app's mono face.
 *
 * Leading with the figure rather than a greeting is the point: the value is why
 * the email exists, and "Hi Nonso" is not.
 */
export function Figure({ tone, children, caption }: { tone: Tone; children: React.ReactNode; caption?: string }) {
  return (
    <Section style={styles.figureRow}>
      <span style={{ ...styles.figure, color: `var(--tone-${tone})` }}>{children}</span>
      {caption ? <span style={styles.figureCaption}>{caption}</span> : null}
    </Section>
  );
}

/** One short line under the figure — a status, a count, a countdown. */
export function Lead({ children }: { children: React.ReactNode }) {
  return <p style={styles.lead}>{children}</p>;
}

/** Body copy. Two or three lines, then the CTA. */
export function Detail({ children }: { children: React.ReactNode }) {
  return <p style={styles.detail}>{children}</p>;
}

/** Small print: what this was, and the promise that nothing is filed for you. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return <p style={styles.footnote}>{children}</p>;
}

/**
 * Custom properties are declared once and overridden for dark mode, so every
 * component reads `var(--text)` rather than a literal. Values come straight from
 * the token module, which mirrors the app's globals.css.
 */
const darkModeCss = `
  :root {
    --surface: ${tokens.light.surface};
    --surface-muted: ${tokens.light.background};
    --line: ${tokens.light.line};
    --text: ${tokens.light.text};
    --text-muted: ${tokens.light.textMuted};
    --accent: ${tokens.light.accent};
    --accent-foreground: ${tokens.light.accentForeground};
    --tone-accent: ${tokens.light.accent};
    --tone-success: ${tokens.light.success};
    --tone-warning: ${tokens.light.warning};
    --tone-danger: ${tokens.light.danger};
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --surface: ${tokens.dark.surface};
      --surface-muted: ${tokens.dark.background};
      --line: ${tokens.dark.line};
      --text: ${tokens.dark.text};
      --text-muted: ${tokens.dark.textMuted};
      --accent: ${tokens.dark.accent};
      --accent-foreground: ${tokens.dark.accentForeground};
      --tone-accent: ${tokens.dark.accent};
      --tone-success: ${tokens.dark.success};
      --tone-warning: ${tokens.dark.warning};
      --tone-danger: ${tokens.dark.danger};
    }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "var(--surface-muted)",
    color: "var(--text)",
    fontFamily: fonts.sans,
    margin: 0,
    padding: `${spacing.page}px 12px`,
    WebkitFontSmoothing: "antialiased",
  },
  page: {
    backgroundColor: "var(--surface)",
    border: `1px solid var(--line)`,
    borderRadius: radius.card,
    margin: "0 auto",
    maxWidth: "560px",
    padding: spacing.card,
  },
  figureRow: { margin: "0 0 8px" },
  figure: {
    display: "block",
    fontFamily: fonts.mono,
    fontSize: "34px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    lineHeight: "1.1",
    fontVariantNumeric: "tabular-nums",
  },
  figureCaption: {
    color: "var(--text-muted)",
    display: "block",
    fontSize: "13px",
    lineHeight: "20px",
    marginTop: "4px",
  },
  lead: { color: "var(--text)", fontSize: "15px", lineHeight: "22px", margin: "0 0 8px" },
  detail: { color: "var(--text-muted)", fontSize: "13px", lineHeight: "20px", margin: "0" },
  ctaRow: { margin: `${spacing.section}px 0 0` },
  cta: {
    backgroundColor: "var(--accent)",
    borderRadius: radius.control,
    color: "var(--accent-foreground)",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 600,
    padding: "11px 20px",
    textDecoration: "none",
  },
  footnote: {
    borderTop: `1px solid var(--line)`,
    color: "var(--text-muted)",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "24px 0 0",
    paddingTop: "16px",
  },
};
