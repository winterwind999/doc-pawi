import {
  distanceKm,
  fitCamera,
  formatCoordinates,
  formatDistance,
  parseCoordinates,
  PHILIPPINES_CAMERA,
  project,
  tilesFor,
  unproject,
} from '@/lib/maps/geo';

const MANILA = { latitude: 14.5995, longitude: 120.9842 };

describe('map projection', () => {
  it('puts (0, 0) in the middle of the world and round-trips positions', () => {
    expect(project({ latitude: 0, longitude: 0 }, 0)).toEqual({ x: 128, y: 128 });
    const p = project(MANILA, 15);
    const back = unproject(p.x, p.y, 15);
    expect(back.latitude).toBeCloseTo(MANILA.latitude, 6);
    expect(back.longitude).toBeCloseTo(MANILA.longitude, 6);
  });

  it('lists the tiles that cover a view, wrapping around the antimeridian', () => {
    const tiles = tilesFor({ left: 0, top: 0, width: 512, height: 512 }, 2, { x: 0, y: 0 });
    // Columns -1..3 (wrapped into 0..3) and rows 0..3: the world is only four tiles tall at zoom 2.
    expect(tiles).toHaveLength(20);
    expect(tiles.find((t) => t.key === '2/-1/0')).toMatchObject({ x: 3, y: 0, left: -256, top: 0 });
    expect(tiles.every((t) => t.y >= 0 && t.y <= 3)).toBe(true);
  });

  it('fits markers inside the view', () => {
    expect(fitCamera([], 360, 280)).toEqual(PHILIPPINES_CAMERA);
    expect(fitCamera([MANILA], 360, 280)).toEqual({ center: MANILA, zoom: 15 });
    const quezonCity = { latitude: 14.676, longitude: 121.0437 };
    const camera = fitCamera([MANILA, quezonCity], 360, 280, 48);
    const center = project(camera.center, camera.zoom);
    for (const point of [MANILA, quezonCity]) {
      const p = project(point, camera.zoom);
      expect(Math.abs(p.x - center.x)).toBeLessThanOrEqual(180 - 48);
      expect(Math.abs(p.y - center.y)).toBeLessThanOrEqual(140 - 48);
    }
    // One zoom level closer would not fit both.
    const closer = fitCamera([MANILA, quezonCity], 720, 560, 96);
    expect(closer.zoom).toBe(camera.zoom + 1);
  });
});

describe('distances and coordinates', () => {
  it('measures straight-line distance', () => {
    expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111.19, 1);
    expect(distanceKm(MANILA, MANILA)).toBe(0);
  });

  it('formats distances for people', () => {
    expect(formatDistance(0.004)).toBe('10 m');
    expect(formatDistance(0.35)).toBe('350 m');
    expect(formatDistance(0.996)).toBe('1.0 km');
    expect(formatDistance(1.234)).toBe('1.2 km');
    expect(formatDistance(12.6)).toBe('13 km');
  });

  it('reads coordinates pasted from a maps app', () => {
    expect(parseCoordinates('14.5995, 120.9842')).toEqual(MANILA);
    expect(parseCoordinates(' 14.5995,120.9842 ')).toEqual(MANILA);
    expect(parseCoordinates('14.5995 120.9842')).toEqual(MANILA);
    // Some keyboards add a space after a period while typing.
    expect(parseCoordinates('14. 5995, 120. 9842')).toEqual(MANILA);
    expect(parseCoordinates('-33.8688; 151.2093')).toEqual({ latitude: -33.8688, longitude: 151.2093 });
    expect(parseCoordinates('95, 10')).toBeNull();
    expect(parseCoordinates('14.5995')).toBeNull();
    expect(parseCoordinates('Quezon City')).toBeNull();
    expect(formatCoordinates(MANILA)).toBe('14.59950, 120.98420');
  });
});
