/** npm run icons — สร้างไอคอน PWA จาก SVG */
import sharp from "sharp";
const svg = (pad: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1d4ed8"/><g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})"><path d="M256 80C256 80 130 230 130 322a126 126 0 0 0 252 0C382 230 256 80 256 80z" fill="#fff"/><path d="M150 330c36-22 72 22 108 0s72 22 108 0" stroke="#1d4ed8" stroke-width="22" fill="none" stroke-linecap="round"/></g></svg>`;
async function main() {
  await sharp(Buffer.from(svg(0))).resize(192).png().toFile("public/icons/icon-192.png");
  await sharp(Buffer.from(svg(0))).resize(512).png().toFile("public/icons/icon-512.png");
  await sharp(Buffer.from(svg(70))).resize(512).png().toFile("public/icons/maskable-512.png");
  console.log("icons ok");
}
main();
