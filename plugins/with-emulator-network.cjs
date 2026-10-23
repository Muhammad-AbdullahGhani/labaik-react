const { withAndroidManifest } = require('expo/config-plugins');
module.exports = function withEmulatorNetwork(config) {
  if (process.env.EXPO_PUBLIC_USE_EMULATORS === 'false') return config;
  return withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest is missing.');
    application.$ ??= {};
    application.$['android:usesCleartextTraffic'] = 'true';
    return result;
  });
};
