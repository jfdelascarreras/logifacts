# Logifacts Design System

This document is the source of truth for Logifacts brand styling in the web app.

## Brand Foundation

- Brand: Logifacts
- Tagline: Insights <> Action <> Arrival
- Design intent: clean logistics intelligence with strong contrast, clear hierarchy, and actionable emphasis.

## Color System

### Primary Colors

- Midnight (Primary Brand Color)
  - HEX: `#12284B`
  - RGB: `18, 40, 75`
  - CMYK: `100, 87, 42, 0`
  - Usage: primary actions, headings, navigation
- Sunset (Accent / CTA)
  - HEX: `#F0493E`
  - RGB: `240, 73, 62`
  - CMYK: `0, 87, 80, 0`
  - Usage: call-to-action buttons, highlights
- Blue Skies (Secondary Surface)
  - HEX: `#A2C7E2`
  - RGB: `162, 199, 226`
  - CMYK: `35, 12, 3, 0`
  - Usage: secondary backgrounds, panels

### Supporting Colors

- Sea Breeze (Light Background / Border)
  - HEX: `#DBE6EF`
  - RGB: `219, 230, 239`
  - Usage: borders, cards, soft UI backgrounds
- Aquamarine (Support Accent)
  - HEX: `#84DADE`
  - RGB: `132, 218, 222`
  - Usage: optional highlights, charts
- Ember (Destructive / Error)
  - HEX: `#C10230`
  - RGB: `193, 2, 48`
  - Usage: errors, destructive actions

## Gradient System

- Midnight Gradient: `#274673 -> #12284B`
- Sunset Gradient: `#F0493E -> #F37053`
- Blue Skies Gradient: `#DBE6EF -> #A2C7E2`

## Typography

- Headings: Oswald (`400`, `500`, `700`)
- Body: Montserrat (`400`, `500`, `700`)

## Token Mapping (App)

Current semantic mapping in `app/globals.css` should follow:

- `--primary`: Midnight `#12284B`
- `--accent`: Sunset `#F0493E`
- `--secondary`: Blue Skies `#A2C7E2`
- `--muted` / soft surfaces: Sea Breeze `#DBE6EF`
- `--destructive`: Ember `#C10230`
- charts include Aquamarine `#84DADE`

## Logo Assets (ZIP Mapping)

The source ZIP used for these assets is:

- `/Users/jose_logifacts/Downloads/2-Final (1).zip`

Selected web assets:

- Header logo (light/default):
  - ZIP source: `2-Primary/1-Full Color/RGB/LF-Primary-FullColor_RGB.png`
  - App path: `/public/branding/logo-primary-fullcolor.png`
- Header logo (dark mode):
  - ZIP source: `2-Primary/2-Color Reverse/RGB/LF-Primary-ColorReverse_RGB.png`
  - App path: `/public/branding/logo-primary-reverse.png`

Favicon:

- Kept as existing app source (`/app/favicon.ico`) unless explicitly replaced later.

## Usage Rules

- Prefer semantic tokens over hardcoded HEX values in components.
- Use Sunset for CTA and highlight emphasis only.
- Reserve Ember for destructive/error states to protect UI meaning.
- Keep logos in `public/branding` with stable filenames to reduce churn.

## Maintenance Notes

- If brand files are re-exported, replace files in `public/branding` while preserving names.
- If palette values change, update this file first, then `app/globals.css`.
