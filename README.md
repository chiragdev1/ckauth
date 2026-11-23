# CKAuth real-world performance

Measured every week from **GitHub Actions runner (US)** against https://ckauth.chiragdev.com, by `scripts/perf/measure.js` on `main`.
Each number is the median of 7 cold page loads in Chromium (no cache, new connections). Lower is better.

**Latest run:** 23 Nov 2026 · compared with 16 Nov 2026

## Latest run against the previous one

| Where | Metric | Previous run | Latest run | Change |
|---|---|--:|--:|---|
| Desktop · home page | Time to first byte | 629 ms | 594 ms | ⚪ −6% |
| Desktop · home page | Largest contentful paint | 992 ms | 956 ms | ⚪ −4% |
| Desktop · home page | Page fully loaded | 1,712 ms | 1,624 ms | ⚪ −5% |
| Desktop · home page | Layout shift | 0.069 | 0.069 | ⚪ ±0% |
| Desktop · home page | Downloaded | 294 KB | 294 KB | ⚪ ±0% |
| Desktop · sign-in page | Time to first byte | 692 ms | 591 ms | ⚪ −15% |
| Desktop · sign-in page | Largest contentful paint | 1,984 ms | 1,760 ms | ⚪ −11% |
| Desktop · sign-in page | Page fully loaded | 1,648 ms | 1,415 ms | ⚪ −14% |
| Desktop · sign-in page | Layout shift | 0.000 | 0.000 | ⚪ ±0% |
| Desktop · sign-in page | Downloaded | 203 KB | 203 KB | ⚪ ±0% |
| Phone on slow 4G · home page | Time to first byte | 630 ms | 592 ms | ⚪ −6% |
| Phone on slow 4G · home page | Largest contentful paint | 1,132 ms | 1,104 ms | ⚪ −2% |
| Phone on slow 4G · home page | Page fully loaded | 2,498 ms | 2,493 ms | ⚪ −0% |
| Phone on slow 4G · home page | Layout shift | 0.001 | 0.001 | ⚪ ±0% |
| Phone on slow 4G · home page | Downloaded | 294 KB | 294 KB | ⚪ ±0% |
| Phone on slow 4G · sign-in page | Time to first byte | 692 ms | 591 ms | ⚪ −15% |
| Phone on slow 4G · sign-in page | Largest contentful paint | 3,088 ms | 2,968 ms | ⚪ −4% |
| Phone on slow 4G · sign-in page | Page fully loaded | 2,188 ms | 2,033 ms | ⚪ −7% |
| Phone on slow 4G · sign-in page | Layout shift | 0.000 | 0.000 | ⚪ ±0% |
| Phone on slow 4G · sign-in page | Downloaded | 203 KB | 203 KB | ⚪ ±0% |
| API (`GET /api/`) | Round trip, typical | 210 ms | 236 ms | ⚪ +12% |
| API (`GET /api/`) | Round trip, slowest 5% | 210 ms | 237 ms | ⚪ +13% |

🟢 faster · 🔴 slower · ⚪ within normal noise (under 25%, or only a few ms)

## Trend

```mermaid
xychart-beta
  title "Home page, desktop: time to first byte (ms)"
  x-axis ["9 Nov", "16 Nov", "23 Nov"]
  y-axis "ms" 0 --> 876
  line [730, 629, 594]
```

```mermaid
xychart-beta
  title "Home page, desktop: largest contentful paint (ms)"
  x-axis ["9 Nov", "16 Nov", "23 Nov"]
  y-axis "ms" 0 --> 1383
  line [1152, 992, 956]
```

```mermaid
xychart-beta
  title "Home page, phone on slow 4G: largest contentful paint (ms)"
  x-axis ["9 Nov", "16 Nov", "23 Nov"]
  y-axis "ms" 0 --> 1570
  line [1308, 1132, 1104]
```

```mermaid
xychart-beta
  title "Sign-in page, phone on slow 4G: largest contentful paint (ms)"
  x-axis ["9 Nov", "16 Nov", "23 Nov"]
  y-axis "ms" 0 --> 3917
  line [3264, 3088, 2968]
```

```mermaid
xychart-beta
  title "API round trip, typical (ms)"
  x-axis ["9 Nov", "16 Nov", "23 Nov"]
  y-axis "ms" 0 --> 291
  line [242, 210, 236]
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
| 23 Nov 2026 | 594 ms | 956 ms | 1,104 ms | 2,968 ms | 294 KB | 236 ms |
| 16 Nov 2026 | 629 ms | 992 ms | 1,132 ms | 3,088 ms | 294 KB | 210 ms |
| 9 Nov 2026 | 730 ms | 1,152 ms | 1,308 ms | 3,264 ms | 408 KB | 242 ms |

</details>
