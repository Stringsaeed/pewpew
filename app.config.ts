import type { ExpoConfig } from 'expo/config';

/**
 * The icon is the layered rocket in design/rocket-icon. iOS gets the Icon Composer bundle (liquid glass on iOS 26,
 * flattened by Xcode for older systems); Android gets adaptive layers cut from the same artwork by scripts/gen-icons.sh.
 */
const config: ExpoConfig = {
  name: 'PewPew',
  slug: 'pewpew',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './design/rocket-icon/rocket-preview.png',
  userInterfaceStyle: 'dark',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.saeed.pewpew',
    requireFullScreen: true,
    appleTeamId: 'V3HN8HXZYK',
    icon: './design/rocket-icon/PewPew.icon',
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
  plugins: ['react-native-audio-api', './plugins/with-ios-scene-delegate'],
};

export default config;
