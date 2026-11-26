import type React from 'react';
import type {
  EmoteType,
  FurnitureCategory,
  LightingMood,
  RoomSurfaceConfig,
  ViewMode,
} from '../game/types';

export type HudState = 'exploration' | 'nearby' | 'social' | 'chat' | 'vehicle' | 'editing' | 'menu';

export type HudPresentation =
  | 'mobile-portrait'
  | 'mobile-landscape'
  | 'tablet-portrait'
  | 'tablet-landscape'
  | 'desktop-browser'
  | 'desktop-app';

export type SocialIntent = 'chat' | 'people' | 'messages';

/** A single control in the HUD. Every control performs its real game action. */
export interface HudAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  pressed?: boolean;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'default' | 'brand' | 'danger';
  hint?: string;
}

/** The contextual action the player is being offered right now. */
export interface HudContextAction extends HudAction {
  /** Short verb used inside the large circular button. */
  verb: string;
  /** Full label shown beside/below the button. */
  label: string;
}

export interface HudNotice {
  id: string;
  title: string;
  body?: string;
  tone?: 'info' | 'success' | 'warn' | 'social';
  icon?: React.ReactNode;
  onDismiss?: () => void;
}

export interface BuildTab {
  id: 'catalog' | 'surfaces' | 'presets';
  label: string;
}

export interface BuildSwatch {
  label: string;
  hex: string;
}

/**
 * Everything the build overlay needs. The viewport owns furniture rules; this
 * controller only exposes the existing App handlers to the presentation layer.
 */
export interface BuildController {
  tab: 'catalog' | 'surfaces' | 'presets';
  setTab: (tab: 'catalog' | 'surfaces' | 'presets') => void;
  categoryFilter: 'all' | FurnitureCategory;
  setCategoryFilter: (category: 'all' | FurnitureCategory) => void;
  itemCount: number;
  historyLength: number;
  canEdit: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  placing: {
    id: string;
    name: string;
    colors: BuildSwatch[];
    color: string;
    isWall: boolean;
  } | null;
  movingName: string | null;
  selected: {
    name: string;
    size: [number, number];
    colors: BuildSwatch[];
    color: string;
    isWall: boolean;
  } | null;
  onPickCatalog: (catalogId: string) => void;
  onCancelPlacement: () => void;
  onRotate: () => void;
  onRecolor: (hex: string) => void;
  onStartMove: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
  surfaces: RoomSurfaceConfig;
  onFloorChange: (floor: RoomSurfaceConfig['floor']) => void;
  onWallChange: (wall: RoomSurfaceConfig['wall']) => void;
  presets: { id: string; name: string; count: number; active: boolean }[];
  onPreset: (presetId: string) => void;
}

export interface CameraHudState {
  viewMode: ViewMode;
  closeZoom: boolean;
  followCharacter: boolean;
  canChangeView: boolean;
  onSetView: (mode: ViewMode) => void;
  onToggleZoom: () => void;
  onToggleFollow: () => void;
}

export interface EmoteHudState {
  active: EmoteType;
  onEmote: (emote: EmoteType) => void;
}

export type HudMood = LightingMood;
