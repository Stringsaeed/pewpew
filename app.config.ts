import type { ExpoConfig } from 'expo/config';

/**
 * The icon is the layered rocket in design/rocket-icon. iOS gets the Icon Composer bundle (liquid glass on iOS 26,
 * flattened by Xcode for older systems); Android gets adaptive layers cut from the same artwork by scripts/gen-icons.sh.
 */
const config: ExpoConfig = {
  name: 'PewPew',
  slug: 'pewpew',
  owner: 'stringsaeed',
  version: '1.1.0',
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/7331076e-619c-48de-a566-bbe0158c0b13',
  },
  orientation: 'portrait',
  icon: './design/rocket-icon/rocket-preview.png',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.saeed.pewpew',
    requireFullScreen: true,
    appleTeamId: 'V3HN8HXZYK',
    icon: './design/rocket-icon/PewPew.icon',
    config: {
      usesNonExemptEncryption: false,
    },
    // Game Center leaderboards (modules/game-center). EAS enables the capability on the App ID from this entitlement.
    entitlements: {
      'com.apple.developer.game-center': true,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#05050f',
      foregroundImage: './design/rocket-icon/android/foreground.png',
      backgroundImage: './design/rocket-icon/android/background.png',
      monochromeImage: './design/rocket-icon/android/monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: 'com.saeed.pewpew',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'react-native-audio-api',
      {
        // The library links recording APIs, so App Store Connect requires a microphone purpose string even though
        // the game only plays sound and never asks for the microphone.
        iosMicrophonePermission: 'PewPew does not record audio and never asks for the microphone. The sound library it uses includes recording support.',
        // The game suspends its audio context when it leaves the foreground, so it needs no background audio mode.
        iosBackgroundMode: false,
      },
    ],
    './plugins/with-ios-scene-delegate',
    // react-native-webgpu's Android code uses AHardwareBuffer, which needs API 26; Expo's default minimum is 24.
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
  ],
  extra: {
    eas: {
      projectId: '7331076e-619c-48de-a566-bbe0158c0b13',
    },
  },
};

export default config;
