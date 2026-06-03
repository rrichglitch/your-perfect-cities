# Your Perfect Cities

A 3D interactive globe that helps you discover cities around the world that match
your values. Built on a SpacetimeDB backend with a deck.gl/WebGL frontend.

## Live Demo

**https://rrichglitch.github.io/your-perfect-cities/**

## Features

- 3D interactive globe with hover-able city dots
- 20 preference sliders across 10 city characteristics (walkability, safety,
  climate, cost of living, culture, etc.) and 10 culture/wisdom dimensions
- Live re-scoring of all cities as you adjust preferences
- 11-language UI (English, Spanish, French, German, Chinese, Hindi, Arabic,
  Japanese, Korean, Portuguese, Russian)
- Language filtering: pick the languages you speak, only matching cities
  surface
- Top-20 ranked list in a side panel
- Google Maps link for any city, opens in a new tab
- Tooltips anchored to the dot (not the cursor) so you can click links
  without the tooltip fleeing

## Stack

- **Frontend:** Vanilla JS + Vite, deck.gl 8.9 (GlobeView + ScatterplotLayer)
- **Backend:** SpacetimeDB 2.0 (Rust module) on maincloud
- **Data pipeline:** Python + DeepSeek V4 Flash LLM for generating per-city
  preference vectors

## Architecture

The frontend is a static SPA. It connects to a public SpacetimeDB database
over a WebSocket, subscribes to the cities/scores/translations tables, and
re-renders the globe as the user adjusts sliders. All scoring happens
server-side; the client only ever receives the final scores.

## Local Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
```

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds the site on every push
to `main` and deploys to GitHub Pages.

## License

MIT
