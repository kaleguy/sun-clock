# Sun Clock

An astronomical clock that visualizes the current time of day, Earth's position in its yearly orbit around the Sun, and the current moon phase — all in a single interactive display.

## Features

- **24-hour clock face** — shows day/night arc based on actual sunrise and sunset times for your location
- **Moon phase ring** — displays the current lunar cycle with accurate illumination rendering
- **Yearly orbit view** — Earth's position on its orbital path around the Sun with season labels and dates
- **50 world cities** — click the city name to switch locations; the clock updates for the selected city's latitude and longitude
- **Southern Hemisphere support** — orbit and season labels flip correctly for cities below the equator
- **Dynamic sky** — background color transitions from black at midnight through twilight blues to light during the day
- **Responsive layout** — desktop shows the full clock; mobile shows an earth/moon detail view with the orbital view below

## Getting Started

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

```bash
npm run deploy
```

## Tech Stack

- React + TypeScript
- Vite
- SVG rendering (no canvas or external charting libraries)
