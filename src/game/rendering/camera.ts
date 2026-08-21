import type { GridPosition } from '../combat/types';

/**
 * Camera-independent pointer/tile conversion math, kept pure so it is
 * testable without a Phaser instance. CombatScene feeds it the camera's
 * current zoom and scroll values.
 */
export interface CameraView {
  zoom: number;
  scrollX: number;
  scrollY: number;
}

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 1.5;

/** Screen pixel -> world pixel, given the camera transform. */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: CameraView,
): { x: number; y: number } {
  return {
    x: camera.scrollX + screenX / camera.zoom,
    y: camera.scrollY + screenY / camera.zoom,
  };
}

/** World pixel -> tile, or null when the point is outside the board. */
export function worldToTile(
  worldX: number,
  worldY: number,
  tileSize: number,
  width: number,
  height: number,
): GridPosition | null {
  const x = Math.floor(worldX / tileSize);
  const y = Math.floor(worldY / tileSize);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}

/** Screen pixel -> tile through the camera transform (single call). */
export function screenToTile(
  screenX: number,
  screenY: number,
  camera: CameraView,
  tileSize: number,
  width: number,
  height: number,
): GridPosition | null {
  const world = screenToWorld(screenX, screenY, camera);
  return worldToTile(world.x, world.y, tileSize, width, height);
}

/** Zoom that fits a world of worldW x worldH into a viewport, clamped. */
export function fitZoom(
  viewWidth: number,
  viewHeight: number,
  worldWidth: number,
  worldHeight: number,
  min = MIN_ZOOM,
  max = MAX_ZOOM,
): number {
  if (viewWidth <= 0 || viewHeight <= 0) return min;
  const fit = Math.min(viewWidth / worldWidth, viewHeight / worldHeight);
  return Math.min(max, Math.max(min, fit));
}
