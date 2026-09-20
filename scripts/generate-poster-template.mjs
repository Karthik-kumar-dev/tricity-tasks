// Generates public/tricity-poster-template.png (1080x1350)
// A static base poster. The profile photo, name and college fields are left
// blank — they are drawn dynamically on an HTML canvas at runtime.
// Usage: node scripts/generate-poster-template.mjs

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public");
const outFile = resolve(outDir, "tricity-poster-template.png");

const SVG = `<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071126"/>
      <stop offset="0.5" stop-color="#0F2B4C"/>
      <stop offset="1" stop-color="#0A1E3A"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.24" r="0.6">
      <stop offset="0" stop-color="#14A29B" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#0F2B4C" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cardTop" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#14A29B"/>
      <stop offset="0.5" stop-color="#3DD5C9"/>
      <stop offset="1" stop-color="#14A29B"/>
    </linearGradient>
  </defs>

  <!-- background -->
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <rect width="1080" height="1350" fill="url(#glow)"/>

  <!-- decorative dots: top left -->
  <g fill="#2DD4BF" opacity="0.55">
    <circle cx="66" cy="58" r="3"/><circle cx="94" cy="58" r="3"/><circle cx="122" cy="58" r="3"/>
    <circle cx="66" cy="86" r="3"/><circle cx="94" cy="86" r="3"/><circle cx="122" cy="86" r="3"/>
    <circle cx="66" cy="114" r="3"/><circle cx="94" cy="114" r="3"/><circle cx="122" cy="114" r="3"/>
  </g>

  <!-- decorative dots: top right -->
  <g fill="#38BDF8" opacity="0.5">
    <circle cx="958" cy="58" r="3"/><circle cx="986" cy="58" r="3"/><circle cx="1014" cy="58" r="3"/>
    <circle cx="958" cy="86" r="3"/><circle cx="986" cy="86" r="3"/><circle cx="1014" cy="86" r="3"/>
    <circle cx="958" cy="114" r="3"/><circle cx="986" cy="114" r="3"/><circle cx="1014" cy="114" r="3"/>
  </g>

  <!-- corner accent frames -->
  <g fill="none" stroke="#2DD4BF" stroke-opacity="0.35" stroke-width="2">
    <path d="M40 210 L40 178 L72 178"/>
    <path d="M1040 210 L1040 178 L1008 178"/>
  </g>

  <!-- badge -->
  <g>
    <rect x="402" y="52" width="276" height="40" rx="20" fill="none" stroke="#2DD4BF" stroke-opacity="0.85" stroke-width="1.5"/>
    <text x="540" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" letter-spacing="4" fill="#5EEAD4">CENTLE INDIA PRESENTS</text>
  </g>

  <!-- title -->
  <text x="540" y="150" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="64" font-weight="900" letter-spacing="6" fill="#FFFFFF">TRI-CITY AI HACKATHON</text>

  <!-- subtitle -->
  <text x="540" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="8" fill="#2DD4BF">WARANGAL · HANAMKONDA · KAZIPET</text>

  <!-- photo zone (drawn over by canvas at runtime, r=135 at (540,340)) -->
  <circle cx="540" cy="340" r="150" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2"/>
  <circle cx="540" cy="340" r="138" fill="#08182F" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="5"/>
  <g opacity="0.4" fill="#FFFFFF">
    <circle cx="540" cy="318" r="34"/>
    <path d="M494 404 C494 376 505 362 540 362 C575 362 586 376 586 404 Z"/>
  </g>
  <text x="540" y="444" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="3" fill="#FFFFFF" opacity="0.6">ADD YOUR PHOTO</text>

  <!-- decorative shapes behind the card -->
  <rect x="52" y="472" width="180" height="180" rx="38" fill="none" stroke="#2DD4BF" stroke-opacity="0.18" stroke-width="2" transform="rotate(14 142 562)"/>
  <rect x="848" y="486" width="160" height="160" rx="36" fill="none" stroke="#38BDF8" stroke-opacity="0.16" stroke-width="2" transform="rotate(-10 928 566)"/>

  <!-- pseudo shadow -->
  <rect x="104" y="440" width="872" height="216" rx="26" fill="#050F1F" opacity="0.5"/>

  <!-- name + college card (name/college drawn dynamically at (540,502)/(540,560)) -->
  <rect x="104" y="428" width="872" height="216" rx="26" fill="#F6F9FC"/>
  <rect x="104" y="428" width="872" height="9" rx="4.5" fill="url(#cardTop)"/>

  <!-- divider -->
  <rect x="240" y="700" width="600" height="2" fill="#FFFFFF" opacity="0.18"/>

  <!-- caption -->
  <text x="540" y="746" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="5" fill="#7DD3FC">REGISTRATION POSTER</text>

  <!-- dates -->
  <text x="540" y="798" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="29" font-weight="900" letter-spacing="5" fill="#FFFFFF">OCTOBER 10 – 11, 2026</text>

  <!-- event line -->
  <text x="540" y="842" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="600" letter-spacing="3" fill="#FFFFFF" opacity="0.85">24-HOUR HACKATHON · CENTLE INDIA HYDERABAD</text>

  <!-- organizer chip -->
  <g>
    <rect x="284" y="868" width="512" height="46" rx="23" fill="#FFFFFF" fill-opacity="0.08" stroke="#FFFFFF" stroke-opacity="0.22"/>
    <circle cx="352" cy="891" r="5" fill="#2DD4BF"/>
    <text x="542" y="897" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="2" fill="#E2E8F0">CENTLE.IN  ·  CENTLE INDIA HYDERABAD</text>
    <circle cx="732" cy="891" r="5" fill="#38BDF8"/>
  </g>

  <!-- hashtag -->
  <text x="540" y="968" text-anchor="middle" font-family="Arial, sans-serif" font-size="19" font-weight="700" letter-spacing="2" fill="#2DD4BF">#TriCityAIHackathon</text>

  <!-- bottom note -->
  <text x="540" y="1012" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="500" letter-spacing="2" fill="#94A3B8">PERSONAL REGISTRATION POSTER · SHARE ON LINKEDIN</text>
</svg>`;

const svgBuf = Buffer.from(SVG, "utf-8");

mkdirSync(outDir, { recursive: true });

const image = sharp(svgBuf, { density: 144 })
  .resize(1080, 1350)
  .png({ compressionLevel: 9, palette: false });

await image.toFile(outFile);
console.log(`Wrote ${outFile}`);