// One shared mark for the interface and the printed archive label.
const paths = `<path d="M156 75C127 48 103 15 70 15C37 15 15 39 15 70S38 128 70 128C103 128 127 96 176 52M155 75C182 99 208 128 240 128C273 128 295 105 295 73S273 15 240 15C221 15 207 23 192 38" fill="none" stroke="currentColor" stroke-width="26"/><path d="M44 70h50M69 45v50M219 70h44" fill="none" stroke="currentColor" stroke-width="15"/>`;
// The label mark is printed at 210 x 98 px on a 1024 x 440 canvas, so the
// 310 x 145 wordmark above reads as a smudge. This is a compact optical glyph
// drawn for that size: two linked rings on the archive's own axis.
const labelPaths = `<circle cx="34" cy="36" r="26" fill="none" stroke="currentColor" stroke-width="11"/><circle cx="76" cy="36" r="26" fill="none" stroke="currentColor" stroke-width="11"/><circle cx="34" cy="36" r="6" fill="currentColor"/>`;
export const labelMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 72" color="#14201c">${labelPaths}</svg>`;
export const logo = `<svg viewBox="0 0 310 185" aria-label="DeepDemos" role="img">${paths}<text x="165" y="174" text-anchor="middle" font-family="MiSans,sans-serif" font-size="16" font-weight="700" letter-spacing="18">DEEPDEMOS</text></svg>`;

// Optical spacing for this fixed wordmark, measured from the reference glyphs.
const analysisPositions = [2, 28, 55, 81, 103, 129, 154, 166];
export const brandHeading = `<h1>DEEPDEMOS</h1><div>AI DEMO ARCHIVE</div><p><span class="brand-analysis" role="img" aria-label="ANALYSIS">${[..."ANALYSIS"].map((letter, i) => `<span aria-hidden="true" style="left:${analysisPositions[i]}px">${letter}</span>`).join("")}</span> <b>OS</b></p>`;
