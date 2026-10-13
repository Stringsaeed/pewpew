// Expo SDK 57's prebuild template predates the iOS 27 SDK requirement that apps adopt the
// UIScene life cycle (without it the app aborts at launch). expo ships ExpoAppSceneDelegate;
// this wires it up the way the SDK 58 template does. Drop this plugin when upgrading to SDK 58.
const fs = require('fs');
const path = require('path');
const { withInfoPlist, withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');

const SCENE_DELEGATE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const withSceneManifest = (config) =>
  withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return c;
  });

const withSceneSources = (config) =>
  withDangerousMod(config, [
    'ios',
    (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, c.modRequest.projectName);
      fs.writeFileSync(path.join(dir, 'SceneDelegate.swift'), SCENE_DELEGATE);

      const appDelegatePath = path.join(dir, 'AppDelegate.swift');
      let src = fs.readFileSync(appDelegatePath, 'utf8');
      if (!src.includes('ExpoReactNativeFactoryProvider')) {
        src = src.replace(
          'class AppDelegate: ExpoAppDelegate {',
          'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
        );
        // Window creation and startReactNative move to SceneDelegate, as do URL/activity callbacks.
        src = src.replace(/#if os\(iOS\) \|\| os\(tvOS\)\n[\s\S]*?#endif\n\n/, '');
        src = src.replace(/\n  \/\/ Linking API[\s\S]*?\n  }\n\n  \/\/ Universal Links[\s\S]*?\n  }\n(?=}\n\nclass ReactNativeDelegate)/, '');
        fs.writeFileSync(appDelegatePath, src);
      }
      return c;
    },
  ]);

const withSceneProject = (config) =>
  withXcodeProject(config, (c) => {
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${c.modRequest.projectName}/SceneDelegate.swift`,
      groupName: c.modRequest.projectName,
      project: c.modResults,
    });
    return c;
  });

module.exports = (config) => withSceneProject(withSceneSources(withSceneManifest(config)));
