import { TILE_SIZE } from "../world/config";
import { WorldMap, isWalkable } from "../world/types";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const PLAYER_SPEED = 96; // world pixels per second (6 tiles/s)

const HALF_WIDTH = 4; // feet collision box: 8 wide, 5 tall, anchored at (x, y)
const BOX_HEIGHT = 5;

export class Player {
  constructor(
    public x: number,
    public y: number,
  ) {}

  update(dt: number, input: InputState, map: WorldMap): void {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    const step = (PLAYER_SPEED * dt) / Math.hypot(dx, dy);
    const nx = this.x + dx * step;
    if (!this.collides(map, nx, this.y)) this.x = nx;
    const ny = this.y + dy * step;
    if (!this.collides(map, this.x, ny)) this.y = ny;
  }

  private collides(map: WorldMap, x: number, y: number): boolean {
    const corners: ReadonlyArray<readonly [number, number]> = [
      [x - HALF_WIDTH, y],
      [x + HALF_WIDTH - 1, y],
      [x - HALF_WIDTH, y - BOX_HEIGHT],
      [x + HALF_WIDTH - 1, y - BOX_HEIGHT],
    ];
    return corners.some(
      ([cx, cy]) => !isWalkable(map, Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE)),
    );
  }
}
