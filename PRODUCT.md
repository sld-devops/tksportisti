# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two equal audiences:
- **The coach (Toms Komass)** plans training for about 20–25 athletes, mostly on a desktop or laptop. Athletes differ a lot in fitness, so every plan is individual.
- **Athletes** follow their plan and log what they did, mostly on a phone, often right after training.

The athlete sees only their own data. The coach picks one athlete at a time.

## Product Purpose

"Toma Komasa Sportistu Portāls" replaces a Google Sheets workflow that was hard to track and not user-friendly. It makes the coach–athlete relationship more transparent and efficient: the coach builds precise, individualized plans quickly, and athletes follow their plan and record execution easily. Deployed at tksportisti.netlify.app.

## Positioning

Per-athlete data is always clearly distinguished, and the coach's daily planning flow takes fewer clicks than a spreadsheet ever could.

## Capabilities and Constraints

- UI language is Latvian.
- Vanilla HTML/CSS/JS, no build step, no framework; Supabase backend (Postgres, Auth, Edge Functions).
- Roles: `coach` and `athlete`.
- Athlete data must never be sent to third-party services (hand-drawn SVG charts, no chart library).
- The project owner is not a programmer; changes must be small and explained in plain Latvian.

## Brand Commitments

None confirmed beyond the existing name and Latvian voice. Logo, colors and accessibility standards are deliberately left undecided.

## Evidence on Hand

The live app and its existing styles (`styles.css`). No testimonials, metrics or customer claims exist; none should be invented.

## Product Principles

- Reduce clicks and time in the coach's day-to-day planning.
- Phone and desktop are both first-class; neither is an afterthought.
- Never mix up athletes' data; the selected athlete must always be obvious.
- Plain, familiar patterns over novelty; this is a work tool used daily.
- Small, safe changes that the owner can follow.
