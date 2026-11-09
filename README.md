# CKAuth real-world performance

Measured every week from **GitHub Actions runner (US)** against https://ckauth.chiragdev.com, by `scripts/perf/measure.js` on `main`.
Each number is the median of 7 cold page loads in Chromium (no cache, new connections). Lower is better.

**Latest run:** 9 Nov 2026 · the first run, so this is the baseline

## Latest run against the previous one

| Where | Metric | Previous run | Latest run | Change |
|---|---|--:|--:|---|
| Desktop · home page | Time to first byte | — | 730 ms | — |
| Desktop · home page | Largest contentful paint | — | 1,152 ms | — |
| Desktop · home page | Page fully loaded | — | 1,953 ms | — |
| Desktop · home page | Layout shift | — | 0.090 | — |
| Desktop · home page | Downloaded | — | 408 KB | — |
| Desktop · sign-in page | Time to first byte | — | 731 ms | — |
| Desktop · sign-in page | Largest contentful paint | — | 2,092 ms | — |
| Desktop · sign-in page | Page fully loaded | — | 1,742 ms | — |
| Desktop · sign-in page | Layout shift | — | 0.000 | — |
| Desktop · sign-in page | Downloaded | — | 207 KB | — |
| Phone on slow 4G · home page | Time to first byte | — | 728 ms | — |
| Phone on slow 4G · home page | Largest contentful paint | — | 1,308 ms | — |
| Phone on slow 4G · home page | Page fully loaded | — | 2,679 ms | — |
| Phone on slow 4G · home page | Layout shift | — | 0.001 | — |
| Phone on slow 4G · home page | Downloaded | — | 289 KB | — |
| Phone on slow 4G · sign-in page | Time to first byte | — | 729 ms | — |
| Phone on slow 4G · sign-in page | Largest contentful paint | — | 3,264 ms | — |
| Phone on slow 4G · sign-in page | Page fully loaded | — | 2,302 ms | — |
| Phone on slow 4G · sign-in page | Layout shift | — | 0.000 | — |
| Phone on slow 4G · sign-in page | Downloaded | — | 207 KB | — |
| API (`GET /api/`) | Round trip, typical | — | 242 ms | — |
| API (`GET /api/`) | Round trip, slowest 5% | — | 243 ms | — |

🟢 faster · 🔴 slower · ⚪ within normal noise (under 25%, or only a few ms)

## Trend

```mermaid
xychart-beta
  title "Home page, desktop: time to first byte (ms)"
  x-axis ["9 Nov"]
  y-axis "ms" 0 --> 876
  line [730]
```

```mermaid
xychart-beta
  title "Home page, desktop: largest contentful paint (ms)"
  x-axis ["9 Nov"]
  y-axis "ms" 0 --> 1383
  line [1152]
```

```mermaid
xychart-beta
  title "Home page, phone on slow 4G: largest contentful paint (ms)"
  x-axis ["9 Nov"]
  y-axis "ms" 0 --> 1570
  line [1308]
```

```mermaid
xychart-beta
  title "Sign-in page, phone on slow 4G: largest contentful paint (ms)"
  x-axis ["9 Nov"]
  y-axis "ms" 0 --> 3917
  line [3264]
```

```mermaid
xychart-beta
  title "API round trip, typical (ms)"
  x-axis ["9 Nov"]
  y-axis "ms" 0 --> 291
  line [242]
```

## What the metrics mean

- **Time to first byte (TTFB):** from clicking to the first byte of the page arriving: DNS lookup, connection and TLS handshake, the edge proxy and the server. Mostly distance; a jump here is the server or the network.
- **Largest contentful paint (LCP):** when the biggest thing on screen (usually the headline) appears. Google counts under 2,500 ms as good.
- **Page fully loaded:** when the browser's load event finishes (every script, style and font).
- **Layout shift (CLS):** how much the page jumps while loading. Under 0.1 is good; 0 means nothing moves.
- **Downloaded:** everything the page fetched, compressed. A jump here is usually a bigger JavaScript bundle.
- **API round trip:** `GET /api/` from inside a loaded page on a warm connection: network there and back, plus the edge proxy and Express.
- **Phone on slow 4G:** a 1.6 Mbit/s connection and a CPU 4× slower than the runner's (Lighthouse's mobile preset). Chrome adds latency once per request, so it is gentler on TTFB than a real slow network.

<details><summary>Every run</summary>

| Date | Desktop TTFB | Desktop LCP | Phone LCP | Phone sign-in LCP | Home KB | API typical |
|---|--:|--:|--:|--:|--:|--:|
| 9 Nov 2026 | 730 ms | 1,152 ms | 1,308 ms | 3,264 ms | 408 KB | 242 ms |

</details>
