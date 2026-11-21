import {
  cellKey,
  type ArchiveCell,
} from "./archive-loop.ts";
import { damp } from "./motion.ts";

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const MAX_OVERVIEW_SLOT_LIGHTS = 6;

type SlotLightEntry = {
  cell: ArchiveCell;
  intensity: number;
  target: number;
};

/**
 * Per-slot underlight values shared by the floor shader, array instances and
 * extracted card materials, driven continuously by the gliding light bar's
 * interpolated slot coordinates.
 */
export class ArchiveSlotUnderlights {
  private readonly entries = new Map<string, SlotLightEntry>();
  private selectedKey = "";
  private targetCell: ArchiveCell;
  private barRow = { value: 0, velocity: 0 };
  private barLane = { value: 0, velocity: 0 };
  private introGain = 1;

  constructor(selected: ArchiveCell) {
    this.targetCell = { ...selected };
    this.barRow.value = selected.row;
    this.barLane.value = selected.lane;
    this.select(selected, true);
  }

  setIntroGain(gain: number) {
    this.introGain = Math.max(0, Math.min(1, gain));
  }

  setBarRow(row: number) {
    this.barRow.value = row;
    this.barRow.velocity = 0;
  }

  select(cell: ArchiveCell, immediate = false) {
    const key = cellKey(cell);
    this.selectedKey = key;
    this.targetCell = { ...cell };
    if (immediate) {
      this.barRow = { value: cell.row, velocity: 0 };
      this.barLane = { value: cell.lane, velocity: 0 };
      this.entries.clear();
      this.entries.set(key, {
        cell: { ...cell },
        intensity: 1,
        target: 1,
      });
      return;
    }

    if (!this.entries.has(key)) {
      this.entries.set(key, {
        cell: { ...cell },
        intensity: 0,
        target: 1,
      });
    }
    for (const [entryKey, entry] of this.entries) {
      entry.target = entryKey === key ? 1 : 0;
    }
    this.trim();
  }

  update(dt: number, reduced: boolean) {
    const attack = reduced ? 40 : 4.8;
    const release = reduced ? 40 : 3.6;
    for (const [key, entry] of this.entries) {
      const rate = entry.target > entry.intensity ? attack : release;
      entry.intensity +=
        (entry.target - entry.intensity) * (1 - Math.exp(-Math.max(0, dt) * rate));
      if (entry.target === 0 && entry.intensity < 0.001) {
        this.entries.delete(key);
      }
    }
    this.trim();
    if (reduced) {
      this.barRow.value = this.targetCell.row;
      this.barRow.velocity = 0;
      this.barLane.value = this.targetCell.lane;
      this.barLane.velocity = 0;
      return;
    }
    const clampedDt = Math.max(0, dt);
    damp(this.barRow, this.targetCell.row, 5.2, clampedDt);
    damp(this.barLane, this.targetCell.lane, 4.8, clampedDt);
    if (
      Math.abs(this.barRow.value - this.targetCell.row) < 1e-4 &&
      Math.abs(this.barRow.velocity) < 1e-4
    ) {
      this.barRow.value = this.targetCell.row;
      this.barRow.velocity = 0;
    }
    if (
      Math.abs(this.barLane.value - this.targetCell.lane) < 1e-4 &&
      Math.abs(this.barLane.velocity) < 1e-4
    ) {
      this.barLane.value = this.targetCell.lane;
      this.barLane.velocity = 0;
    }
  }

  directFor(cell: ArchiveCell) {
    const gain = this.barIntensity;
    if (gain <= 0.0001) return 0;
    const rowDelta = Math.abs(cell.row - this.barRow.value);
    const laneDelta = Math.abs(cell.lane - this.barLane.value);
    if (rowDelta >= 0.95 || laneDelta >= 0.85) return 0;
    const rowWeight = 1 - smoothstep(0.0, 0.95, rowDelta);
    const laneWeight = 1 - smoothstep(0.0, 0.85, laneDelta);
    return Math.min(1, gain * rowWeight * laneWeight);
  }

  /**
   * Neighbor-only diffuse spill. Rows are intentionally wide enough to make
   * several adjacent end faces readable; columns fall off quickly so the light
   * still reads as belonging to one archive column.
   */
  reflectionFor(cell: ArchiveCell) {
    const gain = this.barIntensity;
    if (gain <= 0.0001) return 0;
    const rowDistance = cell.row - this.barRow.value;
    const laneDistance = cell.lane - this.barLane.value;
    const selfMask = smoothstep(
      0.20,
      0.85,
      Math.hypot(rowDistance, laneDistance * 2.0),
    );
    const forwardFade = 1 - smoothstep(11.5, 16.5, rowDistance);
    const rowDecay =
      rowDistance >= 1
        ? Math.exp(-(rowDistance - 1) * 0.10) * forwardFade
        : rowDistance >= 0
          ? 1
          : Math.exp(-rowDistance * rowDistance * 0.20);
    const laneDecay = Math.exp(-laneDistance * laneDistance * 4.2);
    return Math.min(1, gain * selfMask * rowDecay * laneDecay);
  }

  /**
   * Broad optical spill for the long top rail along the selected row across
   * neighboring columns on both sides (`lane - 1/-2` down-left and `lane + 1/+2`
   * up-right into the mist), so the lit row reads as one continuous line.
   */
  topRailFor(cell: ArchiveCell) {
    const gain = this.barIntensity;
    if (gain <= 0.0001) return 0;
    const rowDelta = cell.row - this.barRow.value;
    const laneDistance = this.barLane.value - cell.lane;
    const laneSteps = Math.abs(laneDistance);
    if (laneSteps > 3.5 || Math.abs(rowDelta) > 2.2) return 0;
    const rowWeight = Math.exp(-rowDelta * rowDelta * 2.8);
    const outsideSelf = smoothstep(0.22, 0.78, laneSteps);
    const sideScale = 0.88 + 0.12 * smoothstep(-0.35, 0.35, laneDistance);
    const outerDecay =
      laneSteps <= 1 ? 1 : Math.exp(-(laneSteps - 1) * 0.62);
    return Math.min(1, gain * outsideSelf * sideScale * outerDecay * rowWeight);
  }

  /**
   * Signed cross-lane reflection for the long edge facing a bright source.
   * Positive points toward local +X (lower-left neighbors), negative toward
   * local -X (upper-right neighbors).
   */
  lateralFor(cell: ArchiveCell) {
    const gain = this.barIntensity;
    if (gain <= 0.0001) return 0;
    const rowDelta = cell.row - this.barRow.value;
    const laneDistance = this.barLane.value - cell.lane;
    const laneSteps = Math.abs(laneDistance);
    if (laneSteps > 3.5 || Math.abs(rowDelta) > 2.5) return 0;
    const outsideSelf = smoothstep(0.22, 0.78, laneSteps);
    const outerDecay =
      laneSteps <= 1 ? 1 : Math.exp(-(laneSteps - 1) * 0.88);
    const rowCoeff = rowDelta >= 0 ? 1.30 : 1.55;
    const sign = smoothstep(-0.35, 0.35, laneDistance) * 2 - 1;
    const value =
      sign *
      gain *
      outsideSelf *
      outerDecay *
      Math.exp(-rowDelta * rowDelta * rowCoeff);
    return Math.max(-1, Math.min(1, value));
  }

  /** Compatibility signal for non-shader consumers. */
  brightnessFor(cell: ArchiveCell) {
    return Math.min(
      1,
      this.directFor(cell) + this.reflectionFor(cell),
    );
  }

  get barPosition() {
    return { lane: this.barLane.value, row: this.barRow.value };
  }

  get barIntensity() {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.intensity;
    return Math.min(1, total) * this.introGain;
  }

  get selectedIntensity() {
    return this.directFor(this.targetCell);
  }

  get selectedCell() {
    return this.entries.get(this.selectedKey)?.cell ?? null;
  }

  activeLights() {
    return [...this.entries.values()]
      .sort(
        (a, b) =>
          b.intensity - a.intensity ||
          a.cell.lane - b.cell.lane ||
          a.cell.row - b.cell.row,
      )
      .map(({ cell, intensity }) => ({
        cell: { ...cell },
        intensity,
      }));
  }

  rebase(lane: number, row: number) {
    if (!lane && !row) return;
    this.targetCell.lane -= lane;
    this.targetCell.row -= row;
    this.barLane.value -= lane;
    this.barRow.value -= row;
    const selected = this.entries.get(this.selectedKey);
    const entries = [...this.entries.values()];
    for (const entry of this.entries.values()) {
      entry.cell.lane -= lane;
      entry.cell.row -= row;
    }
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(cellKey(entry.cell), entry);
    }
    this.selectedKey = selected ? cellKey(selected.cell) : "";
  }

  private trim() {
    if (this.entries.size <= MAX_OVERVIEW_SLOT_LIGHTS) return;
    const keep = [...this.entries.entries()]
      .filter(([key]) => key !== this.selectedKey)
      .sort(([, a], [, b]) => b.intensity - a.intensity)
      .slice(0, MAX_OVERVIEW_SLOT_LIGHTS - 1)
      .map(([key]) => key);
    if (this.entries.has(this.selectedKey)) keep.push(this.selectedKey);
    const allowed = new Set(keep);
    for (const key of this.entries.keys()) {
      if (!allowed.has(key)) this.entries.delete(key);
    }
  }
}
