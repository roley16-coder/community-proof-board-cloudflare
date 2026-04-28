# Emergent Redesign Prompt

Recommended integration:
- GitHub repository import
- OpenAI model: GPT-5 class model if available

Recommended design direction:
- Warm editorial operations dashboard
- Brown and orange signboard tone
- Clean admin workflow emphasis
- Mobile-friendly responsive layout

Paste this into Emergent after connecting the GitHub repo:

```text
Redesign this app as a premium hotdeal operations dashboard while preserving the current functionality.

Project goals:
- Keep the existing admin/viewer role logic
- Keep post registration, screenshot viewing, 22-hour recheck, Telegram-linked flow, and FMKorea handling intact
- Improve only presentation, visual hierarchy, spacing, and usability

Design direction:
- Use a warm brown/orange palette that feels like a tasteful signboard, not flashy e-commerce
- Keep the UI professional and operational rather than playful
- Make the main header feel branded and intentional
- Make admin controls feel compact and organized
- Make post cards easy to scan in a dense grid
- Make the notice section look like an internal operations memo board

Layout goals:
- Strong branded header with subtitle and small status pills
- Better separation between intake and notice tabs
- Cleaner side admin column
- More polished post cards with stronger hierarchy
- Better spacing and typography consistency across links, pills, and buttons
- Responsive behavior should remain solid on desktop and mobile

Constraints:
- Do not break current API usage
- Do not remove current workflows
- Preserve Korean copy unless it clearly needs adjustment for consistency
- Prefer changes in public/index.html, public/style.css, and public/app.js only

Output:
- Implement the redesign directly in code
- Keep the app lightweight
- Favor readability and operational clarity over decorative effects
```
