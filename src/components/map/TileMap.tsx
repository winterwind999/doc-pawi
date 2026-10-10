import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, type IconName } from '@/components/ui/Icon';
import type { FacilityType } from '@/lib/db/models';
import {
  clampZoom,
  fitCamera,
  PHILIPPINES_CAMERA,
  project,
  TILE_SIZE,
  tilesFor,
  tileUrl,
  unproject,
  type Camera,
  type LatLng,
} from '@/lib/maps/geo';
import { colors } from '@/theme/colors';

export interface MapMarker extends LatLng {
  id: string;
  label: string;
  color: string;
}

export const FACILITY_MARKER_COLORS: Record<FacilityType, string> = {
  hospital: colors.coral600,
  clinic: colors.primary600,
  laboratory: colors.ocean600,
  diagnostic_center: colors.ocean500,
  pharmacy: colors.sand700,
  other: colors.inkMuted,
};

/**
 * OpenStreetMap's tile policy asks apps for a distinct, stable User-Agent instead of a library
 * default. Its servers answer User-Agents containing "offline" (as offline tile downloaders use)
 * with an "Access blocked" image, so keep that word out. Only tile coordinates are requested:
 * never health data or saved facilities.
 */
const TILE_HEADERS = { 'User-Agent': 'DocPawi/1.0 (Android; com.docpawi.app)' };
/** Versioned so tiles cached under an earlier User-Agent (possibly the "blocked" image) are not reused. */
const TILE_CACHE_VERSION = 'osm-v2';
const MARKER_SIZE = 34;
const SELECTED_MARKER_SIZE = 44;

type Offset = { x: number; y: number };
const NO_PAN: Offset = { x: 0, y: 0 };

function MapButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      className="h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface active:bg-surface-sunken"
    >
      <Icon name={icon} size={22} color={colors.ink} />
    </Pressable>
  );
}

/**
 * A small slippy map drawn from OpenStreetMap tiles: drag to move, pinch or the +/− buttons to
 * zoom, tap a pin to select it. Tiles the phone has seen are cached on disk; without internet the
 * pins still show on a blank background. Until the user moves the map it keeps every marker (and
 * the user's position) in view.
 */
export function TileMap({
  markers,
  user,
  selectedId,
  onSelect,
  onPressMap,
  focus,
  height = 280,
  online = true,
  interactive = true,
}: {
  markers: readonly MapMarker[];
  user?: LatLng | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Called with the tapped position (and the zoom it was tapped at) when the tap is not on a pin. */
  onPressMap?: (point: LatLng, zoom: number) => void;
  /** Re-centers the map on this point each time a new object is passed. */
  focus?: (LatLng & { zoom?: number }) | null;
  height?: number;
  online?: boolean;
  /** Drag and pinch; off inside scrolling forms, where taps and the zoom buttons still work. */
  interactive?: boolean;
}) {
  const [width, setWidth] = useState(0);
  // `camera` stays null, which keeps every marker in view, until the user moves the map or a focus
  // arrives. `pan` is the drag offset the tiles were last laid out for; the live offset is in
  // tx/ty. Each new camera gets a new generation, so gesture results for an old one are dropped.
  const [view, setView] = useState<{ camera: Camera | null; pan: Offset; generation: number }>({
    camera: null,
    pan: NO_PAN,
    generation: 0,
  });
  const [appliedFocus, setAppliedFocus] = useState<typeof focus>(null);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const dragStart = useSharedValue(NO_PAN);
  const gen = useSharedValue(0);

  const fitted = width ? fitCamera([...markers, ...(user ? [user] : [])], width, height) : PHILIPPINES_CAMERA;
  const camera = view.camera ?? fitted;
  const { pan } = view;
  const moveTo = (next: Camera) => setView((v) => ({ camera: next, pan: NO_PAN, generation: v.generation + 1 }));

  // A new focus object re-centers the map (state adjusted while rendering, as React recommends
  // for responding to a changed prop).
  if ((focus ?? null) !== appliedFocus) {
    setAppliedFocus(focus ?? null);
    if (focus) moveTo({ center: focus, zoom: clampZoom(focus.zoom ?? Math.max(camera.zoom, 15)) });
  }

  // Each new camera starts without a drag offset or pinch scale.
  useEffect(() => {
    tx.set(0);
    ty.set(0);
    scale.set(1);
    gen.set(view.generation);
  }, [view.generation, tx, ty, scale, gen]);

  const centerPx = project(camera.center, camera.zoom);
  const origin = { x: centerPx.x - width / 2, y: centerPx.y - height / 2 };
  const tiles = width ? tilesFor({ left: origin.x - pan.x, top: origin.y - pan.y, width, height }, camera.zoom, origin) : [];
  const toScreen = (p: LatLng) => {
    const w = project(p, camera.zoom);
    return { x: w.x - origin.x, y: w.y - origin.y };
  };
  /** The point under the view's center, given the drag offset. */
  const centerFor = (offsetX: number, offsetY: number) => unproject(origin.x + width / 2 - offsetX, origin.y + height / 2 - offsetY, camera.zoom);

  const zoomBy = (delta: number) => moveTo({ center: centerFor(pan.x, pan.y), zoom: clampZoom(camera.zoom + delta) });

  const commitPan = (x: number, y: number, g: number) => {
    // The first drag also fixes the fitted camera, so later marker changes do not move the map.
    setView((v) => (v.generation === g ? { ...v, camera: v.camera ?? camera, pan: { x, y } } : v));
  };

  const commitPinch = (factor: number, x: number, y: number, g: number) => {
    if (g !== view.generation) return;
    const delta = Math.round(Math.log2(factor));
    if (delta === 0) scale.set(withTiming(1, { duration: 150 }));
    else moveTo({ center: centerFor(x, y), zoom: clampZoom(camera.zoom + delta) });
  };

  const handleTap = (x: number, y: number, offsetX: number, offsetY: number, g: number) => {
    if (g !== view.generation) return;
    const worldX = origin.x + x - offsetX;
    const worldY = origin.y + y - offsetY;
    // A pin is hit when the tap is on its icon (anchored at the bottom center) or just around it.
    let best: { id: string; d: number } | null = null;
    for (const m of markers) {
      const p = project(m, camera.zoom);
      const dx = worldX - p.x;
      const dy = worldY - (p.y - MARKER_SIZE / 2);
      if (Math.abs(dx) <= 24 && Math.abs(dy) <= 28) {
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { id: m.id, d };
      }
    }
    if (best) onSelect?.(best.id);
    else if (onPressMap) onPressMap(unproject(worldX, worldY, camera.zoom), camera.zoom);
    else onSelect?.(null);
  };

  // Shared values use get()/set(), which the React Compiler understands.
  const panGesture = Gesture.Pan()
    .enabled(interactive)
    .onStart(() => {
      'worklet';
      dragStart.set({ x: tx.get(), y: ty.get() });
    })
    .onUpdate((e) => {
      'worklet';
      tx.set(dragStart.get().x + e.translationX);
      ty.set(dragStart.get().y + e.translationY);
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(commitPan, tx.get(), ty.get(), gen.get());
    });
  const pinchGesture = Gesture.Pinch()
    .enabled(interactive)
    .onUpdate((e) => {
      'worklet';
      scale.set(e.scale);
    })
    .onEnd((e) => {
      'worklet';
      scheduleOnRN(commitPinch, e.scale, tx.get(), ty.get(), gen.get());
    });
  const tapGesture = Gesture.Tap().onEnd((e) => {
    'worklet';
    scheduleOnRN(handleTap, e.x, e.y, tx.get(), ty.get(), gen.get());
  });
  const gesture = Gesture.Race(Gesture.Simultaneous(panGesture, pinchGesture), tapGesture);

  // Scale first so pinching zooms around the middle of the view wherever the map was dragged.
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }, { translateX: tx.get() }, { translateY: ty.get() }],
  }));

  const ordered = [...markers].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  const selected = markers.find((m) => m.id === selectedId) ?? null;
  const userPoint = user ? toScreen(user) : null;
  const selectedPoint = selected ? toScreen(selected) : null;

  const layer = (
    <Animated.View
      style={[StyleSheet.absoluteFill, layerStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {tiles.map((t) => (
        <Image
          key={t.key}
          source={{ uri: tileUrl(t), headers: TILE_HEADERS, cacheKey: `${TILE_CACHE_VERSION}/${t.z}/${t.x}/${t.y}` }}
          cachePolicy="disk"
          style={{ position: 'absolute', left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
        />
      ))}
      {userPoint ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: userPoint.x - 10,
            top: userPoint.y - 10,
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 3,
            borderColor: colors.white,
            backgroundColor: colors.ocean500,
          }}
        />
      ) : null}
      {ordered.map((m) => {
        const p = toScreen(m);
        const size = m.id === selectedId ? SELECTED_MARKER_SIZE : MARKER_SIZE;
        return (
          <View key={m.id} pointerEvents="none" style={{ position: 'absolute', left: p.x - size / 2, top: p.y - size }}>
            <Icon name="map-marker" size={size} color={m.color} />
          </View>
        );
      })}
      {selected && selectedPoint ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: selectedPoint.x - 90, top: selectedPoint.y - SELECTED_MARKER_SIZE - 30, width: 180 }}
          className="items-center"
        >
          <Text numberOfLines={1} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink">
            {selected.label}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );

  return (
    <View
      style={{ height }}
      className="overflow-hidden rounded-2xl border border-line bg-surface-sunken"
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {/* Gestures attach to an untransformed view, so tap positions are in the map view's own space. */}
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          {layer}
        </View>
      </GestureDetector>

      <View className="absolute right-2 top-2 gap-2">
        <MapButton icon="plus" label="Zoom in" onPress={() => zoomBy(1)} />
        <MapButton icon="minus" label="Zoom out" onPress={() => zoomBy(-1)} />
        {user ? (
          <MapButton
            icon="crosshairs-gps"
            label="Center on your location"
            onPress={() => moveTo({ center: user, zoom: Math.max(camera.zoom, 14) })}
          />
        ) : null}
      </View>
      {!online ? (
        <View className="absolute left-2 top-2 flex-row items-center gap-1 rounded-lg bg-surface px-2 py-1">
          <Icon name="wifi-off" size={14} color={colors.inkMuted} />
          <Text className="text-xs text-ink-muted">Offline: map images may be missing</Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => void Linking.openURL('https://www.openstreetmap.org/copyright')}
        accessibilityRole="link"
        accessibilityLabel="Map data copyright OpenStreetMap contributors"
        className="absolute bottom-0 right-0 rounded-tl-md bg-surface/80 px-1.5 py-0.5"
      >
        <Text className="text-[10px] text-ink-muted">© OpenStreetMap contributors</Text>
      </Pressable>
    </View>
  );
}
