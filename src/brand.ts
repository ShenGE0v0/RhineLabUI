// The label mark is printed at 210 x 98 px on a 1024 x 440 canvas, so a
// wide wordmark reads as a smudge. This is a compact optical glyph
// drawn for that size: two linked rings on the archive's own axis.
const labelPaths = `<circle cx="34" cy="36" r="26" fill="none" stroke="currentColor" stroke-width="11"/><circle cx="76" cy="36" r="26" fill="none" stroke="currentColor" stroke-width="11"/><circle cx="34" cy="36" r="6" fill="currentColor"/>`;
export const labelMarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 72" color="#14201c">${labelPaths}</svg>`;
export const logo = `<span class="loading-wordmark">DEEPDEMOS</span><span class="loading-subtitle">AI DEMO ARCHIVE</span>`;

// Optical spacing for this fixed wordmark, measured from the reference glyphs.
const analysisPositions = [2, 28, 55, 81, 103, 129, 154, 166];
export const brandHeading = `<h1>DEEPDEMOS</h1><div>AI DEMO ARCHIVE</div><p><span class="brand-analysis" role="img" aria-label="ANALYSIS">${[..."ANALYSIS"].map((letter, i) => `<span aria-hidden="true" style="left:${analysisPositions[i]}px">${letter}</span>`).join("")}</span> <b>OS</b></p>`;
