import * as React from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { fonts, radius, spacing, tokens, type Tone } from "./tokens.js";
import { appUrl } from "./links.js";

/**
 * Shared shell for every Dobby email.
 *
 * Built on React Email's own components — `Html`, `Head`, `Preview`, `Body`,
 * `Container`, `Text`, `Heading`, `Button`, `Hr` — rather than hand-rolled
 * markup. They handle the parts that are easy to get quietly wrong in mail: the
 * preview snippet, the table-based button that Outlook will not mangle, the
 * heading semantics, and the document resets.
 *
 * Dark mode overrides the same custom properties inside a `prefers-color-scheme`
 * block — the email equivalent of the app's `.dark` token block, and the reason
 * one template serves both schemes.
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
      <Body className="dm-page" style={styles.body}>
        <Container className="dm-surface" style={styles.page}>
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
 * SVG at all, and the ones that do render it inconsistently. The file is a 64px
 * square — twice the size it is displayed at, so it stays sharp on a retina
 * screen without costing the message a hundred kilobytes the way the 512px
 * source would.
 *
 * The mark alone, centred, with no wordmark beside it. The name is already in
 * the sender line, so repeating it here spent the reader's attention on the one
 * thing they already knew.
 */
export function EmailHeader() {
  return (
    <Section style={styles.header}>
      <img src={appUrl("/dobby-logo-email.png")} alt="Dobby" width={32} height={32} style={styles.logo} />
    </Section>
  );
}

/**
 * The single call to action. One per email by design — two buttons is how a
 * transactional template ends up with none that get pressed.
 *
 * React Email's `Button` renders the anchor with the role and table markup that
 * survives Outlook; the radius and colour are ours so it matches the app's
 * pill control exactly, in both schemes.
 */
export function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Section style={styles.ctaRow}>
      <Button href={href} className="dm-accent dm-accent-fg" style={styles.cta}>
        {children}
      </Button>
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
    <Section className="dm-text" style={styles.figureRow}>
      <span className={`dm-tone-${tone}`} style={{ ...styles.figure, color: TONE[tone] }}>{children}</span>
      {caption ? <span className="dm-muted" style={styles.figureCaption}>{caption}</span> : null}
    </Section>
  );
}

/** What the email is about, set as a heading rather than a sentence in a paragraph. */
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Heading as="h1" className="dm-text" style={styles.title}>
      {children}
    </Heading>
  );
}

/**
 * The reference line under the title — a date, a period, a count.
 *
 * Present on every email so the reader can tell at a glance when it was raised,
 * which is the thing a receipt-shaped message most needs to say.
 */
export function Meta({ children }: { children: React.ReactNode }) {
  return <Text className="dm-muted" style={styles.meta}>{children}</Text>;
}

/** One short line under the figure — a status, a count, a countdown. */
export function Lead({ children }: { children: React.ReactNode }) {
  return <Text className="dm-text" style={styles.lead}>{children}</Text>;
}

/** Body copy. Two or three lines, then the CTA. */
export function Detail({ children }: { children: React.ReactNode }) {
  return <Text className="dm-muted" style={styles.detail}>{children}</Text>;
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
    <Section>
      <table role="presentation" width="100%" style={styles.lineItemTable}>
        <tbody>
          <tr>
            <td className="dm-text dm-line" style={styles.lineItemLabel}>{label}</td>
            <td className="dm-text dm-line" style={styles.lineItemValue}>{value}</td>
          </tr>
        </tbody>
      </table>
    </Section>
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
    <Section>
      <table role="presentation" width="100%" style={styles.totalTable}>
        <tbody>
          <tr>
            <td className="dm-text dm-line" style={styles.totalLabel}>{label}</td>
            <td className="dm-text dm-line" style={styles.totalValue}>{value}</td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/** Hairline between blocks, so the email has sections without boxes. */
export function Divider() {
  return <Hr className="dm-line" style={styles.divider} />;
}

/** Small print: what this was, and the promise that nothing is filed for you. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return <Text className="dm-muted" style={styles.footnote}>{children}</Text>;
}

/**
 * Custom properties are declared once and overridden for dark mode, so every
 * component reads tokens.light.text rather than a literal. Values come straight from
 * the token module, which mirrors the app's globals.css.
 */
/**
 * Dark mode, the only way email can do it.
 *
 * Colours are written as literal values in the inline `style` above, not as CSS
 * custom properties. `var()` does not work in mail: Gmail strips `<style>` from
 * `<head>` outright, and even clients that keep it do not resolve custom
 * properties. A button painted `background-color: var(--accent)` therefore
 * arrived with no background at all, which is exactly what a button that "only
 * shows as text" looks like.
 *
 * So the light palette is inline where every client sees it, and this block
 * repaints the same elements by class in clients that report a dark preference.
 * `!important` is required to beat the inline style that won otherwise. Clients
 * without a dark preference simply keep the light values.
 *
 * The MSO conditional stops Outlook for Windows from rendering the block, where
 * it would apply dark colours without the rest of the layout agreeing with it.
 */
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-page { background-color: ${tokens.dark.background} !important; }
    .dm-surface { background-color: ${tokens.dark.surface} !important; }
    .dm-text { color: ${tokens.dark.text} !important; }
    .dm-muted { color: ${tokens.dark.textMuted} !important; }
    .dm-line { border-color: ${tokens.dark.line} !important; }
    .dm-accent { background-color: ${tokens.dark.accent} !important; }
    .dm-accent-fg { color: ${tokens.dark.accentForeground} !important; }
    .dm-tone-success { color: ${tokens.dark.success} !important; }
    .dm-tone-warning { color: ${tokens.dark.warning} !important; }
    .dm-tone-danger { color: ${tokens.dark.danger} !important; }
  }
`;

/** Semantic colour for a figure or status, resolved to a literal for the light scheme. */
const TONE: Record<Tone, string> = {
  accent: tokens.light.text,
  success: tokens.light.success,
  warning: tokens.light.warning,
  danger: tokens.light.danger,
};

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: tokens.light.background,
    color: tokens.light.text,
    fontFamily: fonts.sans,
    margin: 0,
    padding: `${spacing.page} 12px`,
    WebkitFontSmoothing: "antialiased",
  },
  page: {
    backgroundColor: tokens.light.surface,
    border: `1px solid ${tokens.light.line}`,
    borderRadius: radius.card,
    margin: "0 auto",
    maxWidth: "560px",
    padding: spacing.card,
  },
  header: {
    display: "flex",
    justifyContent: "center",
    margin: `0 0 ${spacing.card}`,
  },
  logo: { borderRadius: "8px", display: "block", height: "32px", width: "32px" },
  figureRow: { margin: "0 0 16px" },
  figure: {
    color: tokens.light.text,
    display: "block",
    fontFamily: fonts.sans,
    fontSize: "40px",
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: "1.05",
    margin: 0,
    fontVariantNumeric: "tabular-nums",
  },
  figureCaption: {
    color: tokens.light.textMuted,
    display: "block",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "4px 0 0",
  },
  title: {
    color: tokens.light.text,
    fontFamily: fonts.sans,
    fontSize: "26px",
    fontWeight: 600,
    letterSpacing: "-0.03em",
    lineHeight: "32px",
    margin: "0 0 6px",
  },
  meta: {
    color: tokens.light.textMuted,
    fontFamily: fonts.sans,
    fontSize: "12px",
    letterSpacing: "0.01em",
    lineHeight: "18px",
    margin: "0 0 24px",
  },
  lead: { color: tokens.light.text, fontFamily: fonts.sans, fontSize: "16px", fontWeight: 500, lineHeight: "24px", margin: "0 0 10px" },
  detail: { color: tokens.light.textMuted, fontFamily: fonts.sans, fontSize: "14px", lineHeight: "22px", margin: "0" },
  ctaRow: { margin: `${spacing.section} 0 0`, textAlign: "center" },
  cta: {
    backgroundColor: tokens.light.accent,
    borderRadius: radius.control,
    color: tokens.light.accentForeground,
    display: "inline-block",
    fontFamily: fonts.sans,
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "12px 22px",
    textDecoration: "none",
  },
  lineItemTable: { borderCollapse: "collapse", margin: "0", width: "100%" },
  lineItemLabel: {
    borderBottom: `1px solid ${tokens.light.line}`,
    color: tokens.light.text,
    fontFamily: fonts.sans,
    fontSize: "14px",
    lineHeight: "20px",
    padding: "10px 12px 10px 0",
    verticalAlign: "top",
  },
  lineItemValue: {
    borderBottom: `1px solid ${tokens.light.line}`,
    color: tokens.light.text,
    fontFamily: fonts.sans,
    fontSize: "14px",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "20px",
    padding: "10px 0",
    textAlign: "right",
    whiteSpace: "nowrap",
    width: "35%",
  },
  totalTable: { borderCollapse: "collapse", margin: "0", width: "100%" },
  totalLabel: {
    borderTop: `2px solid ${tokens.light.text}`,
    color: tokens.light.text,
    fontFamily: fonts.sans,
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "14px 12px 0 0",
  },
  totalValue: {
    borderTop: `2px solid ${tokens.light.text}`,
    color: tokens.light.text,
    fontFamily: fonts.sans,
    fontSize: "17px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: "20px",
    padding: "12px 0 0",
    textAlign: "right",
    whiteSpace: "nowrap",
    width: "35%",
  },
  divider: { borderColor: tokens.light.line, borderStyle: "solid", borderWidth: "1px 0 0", margin: `${spacing.section} 0` },
  footnote: {
    borderTop: `1px solid ${tokens.light.line}`,
    color: tokens.light.textMuted,
    fontFamily: fonts.sans,
    fontSize: "12px",
    lineHeight: "18px",
    margin: "24px 0 0",
    paddingTop: "16px",
  },
};