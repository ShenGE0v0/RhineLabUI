const PATTERNS: Record<string, string> = {
  "0": "101001101101",
  "1": "110100101011",
  "2": "101100101011",
  "3": "110110010101",
  "4": "101001101011",
  "5": "110100110101",
  "6": "101100110101",
  "7": "101001011011",
  "8": "110100101101",
  "9": "101100101101",
  "-": "100101011011",
  "*": "100101101101",
};

const QUIET_MODULES = 10;

export function code39Patterns(value: string) {
  const safe = value.replace(/[^0-9-]/g, "-") || "0000-00-00";
  return `*${safe}*`.split("").map((char) => PATTERNS[char] ?? PATTERNS["-"]);
}

export function drawCode39Barcode(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color = "#14201c",
) {
  const patterns = code39Patterns(value);
  const moduleCount =
    patterns.reduce((sum, pattern) => sum + pattern.length, 0) +
    (patterns.length - 1) +
    QUIET_MODULES * 2;
  const moduleWidth = Math.max(1, Math.floor(width / moduleCount));
  const actualWidth = moduleWidth * moduleCount;
  let cursor =
    x + Math.floor((width - actualWidth) / 2) + QUIET_MODULES * moduleWidth;

  context.save();
  context.fillStyle = color;
  for (const pattern of patterns) {
    for (const module of pattern) {
      if (module === "1") context.fillRect(cursor, y, moduleWidth, height);
      cursor += moduleWidth;
    }
    cursor += moduleWidth;
  }
  context.restore();
}
