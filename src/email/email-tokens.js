/*
 * email-tokens.js -- Brand constants for inline email CSS.
 *
 * Email clients strip <style> blocks and do not support CSS custom properties.
 * All values extracted from src/design-system.css -- do not use CSS var() here.
 * All color values are hex strings for direct use in style="..." attributes.
 *
 * Tests: test/email-templates.test.js
 */

export const tokens = {
  colors: {
    // Neutrals
    text:          '#1e2a36',
    textMuted:     '#6e6a66',
    bg:            '#f7f6f5',
    surface:       '#ffffff',
    surfaceMuted:  '#f3f2f0',
    border:        '#dddbd8',
    borderSubtle:  '#ece9e6',

    // Brand
    primary:       '#2a3444',
    primaryText:   '#f8f8fa',

    // Semantic
    success:       '#2e7d32',
    successBg:     '#e8f5e9',
    successText:   '#1b5e20',
    error:         '#c62828',
    errorBg:       '#ffebee',
    errorText:     '#b71c1c',
    warning:       '#e6a817',
    warningBg:     '#fff8e1',
    warningText:   '#7a5800',
    info:          '#1565c0',
    infoBg:        '#e3f2fd',
    infoText:      '#0d47a1',
  },

  // Font stack for MSO conditional comments and inline style
  fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

  // Container width in px (600px is the safe email client maximum)
  maxWidth: 600,

  // Border radii in px
  borderRadius: {
    sm: 2,
    md: 4,
    lg: 6,
  },
};
