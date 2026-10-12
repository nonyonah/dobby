import * as React from "react";
import { Body, Container, Head, Html, Preview, Section } from "@react-email/components";
import { fonts, radius, spacing, tokens, type Tone } from "./tokens.js";
import { appUrl } from "./links.js";

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
        <Container style={styles.page}>
          <EmailHeader />
          {children}
        </Container>
      </Body>
    </Html>
  );
}

/**
 * The brand mark, at the top of every email.
 *
 * A raster PNG rather than the app's SVG: most mail clients will not render an
 * SVG at all, and the ones that do render it inconsistently, so a wordmark with
 * no logo is what every template shipped until now. The file is a 64px square —
 * twice the size it is displayed at, so it stays sharp on a retina screen
 * without costing the message a hundred kilobytes the way the 512px source
 * would.
 *
 * The wordmark is real text rather than part of the image, so it stays legible
 * when images are blocked and reads correctly in every client.
 */
export function EmailHeader() {
  return (
    <Section style={styles.header}>
      <img
        src={appUrl("/dobby-logo-email.png")}
        alt="Dobby"
        width={32}
        height={32}
        style={styles.logo}
      />
      <span style={styles.wordmark}>Dobby</span>
    </Section>
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

/** What the email is about, set as a heading rather than a sentence in a paragraph. */
export function Title({ children }: { children: React.ReactNode }) {
  return <h1 style={styles.title}>{children}</h1>;
}

/**
 * The reference line under the title — a date, an id, a period.
 *
 * Present on every email so the reader can tell at a glance when it was raised,
 * which is the thing a receipt-shaped message most needs to say.
 */
export function Meta({ children }: { children: React.ReactNode }) {
  return <p style={styles.meta}>{children}</p>;
}

/**
 * One line of an itemised list: the name on the left, the figure on the right.
 *
 * Built on a table rather than flexbox because Outlook renders through Word and
 * drops `justify-content`, which would leave every amount stranded mid-row. The
 * value is tabular and mono so a column of figures lines up on the decimal, the
 * way it does everywhere else in the product.
 */
export function LineItem({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <table role="presentation" width="100%" style={styles.lineItemTable}>
      <tbody>
        <tr>
          <td style={styles.lineItemLabel}>{label}</td>
          <td style={styles.lineItemValue}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The closing figure, ruled off from the items above it.
 *
 * The heavier top border is what makes it read as a total rather than another
 * row, and it is why this is a separate primitive instead of `LineItem` with
 * different padding.
 */
export function TotalRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <table role="presentation" width="100%" style={styles.totalTable}>
      <tbody>
        <tr>
          <td style={styles.totalLabel}>{label}</td>
          <td style={styles.totalValue}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Hairline between blocks, so the email has sections without boxes. */
export function Divider() {
  return <div style={styles.divider} />;
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
  header: {
    alignItems: "center",
    display: "flex",
    gap: "10px",
    margin: `0 0 ${spacing.card}px`,
  },
  logo: { borderRadius: "8px", display: "block", height: "32px", width: "32px" },
  wordmark: {
    color: "var(--text)",
    fontSize: "15px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
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
  title: {
    color: "var(--text)",
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    lineHeight: "28px",
    margin: `0 0 4px`,
  },
  meta: {
    color: "var(--text-muted)",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 20px",
  },
  lineItemTable: { borderCollapse: "collapse", margin: "0", width: "100%" },
  lineItemLabel: {
    borderBottom: `1px solid var(--line)`,
    color: "var(--text)",
    fontSize: "14px",
    lineHeight: "20px",
    padding: "10px 12px 10px 0",
    verticalAlign: "top",
  },
  lineItemValue: {
    borderBottom: `1px solid var(--line)`,
    color: "var(--text)",
    fontFamily: fonts.mono,
    fontSize: "14px",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "20px",
    padding: "10px 0",
    textAlign: "right",
    whiteSpace: "nowrap",
    width: "30%",
  },
  // The final item before a total keeps its rule, so the block closes on a line
  // rather than stopping one row short of it.
  totalTable: { borderCollapse: "collapse", margin: "0", width: "100%" },
  totalLabel: {
    borderTop: `2px solid var(--text)`,
    color: "var(--text)",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "12px 12px 0 0",
  },
  totalValue: {
    borderTop: `2px solid var(--text)`,
    color: "var(--text)",
    fontFamily: fonts.mono,
    fontSize: "16px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "12px 0 0",
    textAlign: "right",
    whiteSpace: "nowrap",
    width: "30%",
  },
  divider: { borderTop: `1px solid var(--line)`, margin: `${spacing.section}px 0` },
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
