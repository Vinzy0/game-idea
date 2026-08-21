import { describe, expect, it } from 'vitest';
import {
  fitZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  screenToTile,
  screenToWorld,
  worldToTile,
} from '../camera';

describe('camera-independent pointer-to-tile conversion', () => {
  const TILE = 32;

  it('converts world pixels to tiles and rejects out-of-bounds points', () => {
    expect(worldToTile(0, 0, TILE, 32, 32)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(31, 31, TILE, 32, 32)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(32, 32, TILE, 32, 32)).toEqual({ x: 1, y: 1 });
    expect(worldToTile(1023, 1023, TILE, 32, 32)).toEqual({ x: 31, y: 31 });
    expect(worldToTile(1024, 0, TILE, 32, 32)).toBeNull();
    expect(worldToTile(0, 1024, TILE, 32, 32)).toBeNull();
    expect(worldToTile(-1, 0, TILE, 32, 32)).toBeNull();
  });

  it('round-trips screen points through pan and zoom to the same tile', () => {
    const camera = { zoom: 0.8, scrollX: 120, scrollY: 60 };
    // A screen pixel maps to a world pixel; that world pixel maps to a tile.
    const world = screenToWorld(400, 300, camera);
    const tile = worldToTile(world.x, world.y, TILE, 32, 32);
    expect(tile).toEqual(screenToTile(400, 300, camera, TILE, 32, 32));
    // Recompute by hand: world = 120 + 400 / 0.8 = 620 -> tile 19; 60 + 300 / 0.8 = 435 -> tile 13.
    expect(tile).toEqual({ x: 19, y: 13 });
  });

  it('is zoom-independent: the same tile stays under the pointer after zooming', () => {
    const before = { zoom: 1, scrollX: 0, scrollY: 0 };
    const after = { zoom: 1.4, scrollX: 0, scrollY: 0 };
    // Tile (10,10) occupies world [320, 352). With zoom 1.4 and scroll 0,
    // its screen position is world * 1.4.
    const screenX = 320 * 1.4 + 10;
    const screenY = 320 * 1.4 + 10;
    expect(screenToTile(screenX, screenY, after, TILE, 32, 32)).toEqual({ x: 10, y: 10 });
    // Same world point under a different zoom still resolves to the same tile.
    expect(screenToTile(320 + 10, 320 + 10, before, TILE, 32, 32)).toEqual({ x: 10, y: 10 });
  });

  it('keeps the zoomed-to point fixed: scroll compensates the zoom change', () => {
    // Zoom toward the pointer at screen (400,300) with the world point under
    // it preserved: newScroll = world - screen / newZoom.
    const camera = { zoom: 1, scrollX: 0, scrollY: 0 };
    const world = screenToWorld(400, 300, camera); // (400, 300)
    const newZoom = 1.5;
    const scrolled = {
      zoom: newZoom,
      scrollX: world.x - 400 / newZoom,
      scrollY: world.y - 300 / newZoom,
    };
    expect(screenToWorld(400, 300, scrolled)).toEqual({ x: 400, y: 300 });
    expect(screenToTile(400, 300, scrolled, TILE, 32, 32)).toEqual({ x: 12, y: 9 });
  });

  it('clamps the fit zoom to 0.5-1.5', () => {
    expect(fitZoom(800, 600, 1024, 1024)).toBeCloseTo(0.5859375); // min(800, 600)/1024 fits the whole map
    expect(fitZoom(200, 100, 1024, 1024)).toBe(MIN_ZOOM); // tiny viewport -> min
    expect(fitZoom(5000, 5000, 1024, 1024)).toBe(MAX_ZOOM); // huge viewport -> max
    expect(fitZoom(1024, 1024, 1024, 1024)).toBe(1);
  });
});
