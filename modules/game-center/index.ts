import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export interface Player { readonly id: string; readonly displayName: string; readonly alias: string }
export interface LocalEntry { readonly rank: number; readonly score: number; readonly total: number }

/** Mirrors modules/game-center/ios/GameCenterModule.swift. The same `declare class` shape first-party Expo modules use. */
declare class Native extends NativeModule<{ onAuth: (ev: { player: Player | null }) => void }> {
  readonly isAuthenticated: boolean;
  authenticate(): Promise<Player | null>;
  submit(value: number, boards: readonly string[]): Promise<void>;
  localEntry(board: string): Promise<LocalEntry | null>;
  show(board: string | null): Promise<void>;
}

/** Null where GameKit does not exist (Android, web), so callers can hide the leaderboard buttons. */
export const GameCenter: Native | null = requireOptionalNativeModule<Native>('GameCenter');
