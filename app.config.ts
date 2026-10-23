import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Labaik Field',
  slug: 'labaik-field',
  android: {
    ...config.android,
    package: 'com.abdullahghani.labaikfield',
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  plugins: [
    ...(config.plugins ?? []),
    '@react-native-firebase/app',
    '@react-native-firebase/auth',
    './plugins/with-emulator-network.cjs',
    [
      'expo-camera',
      {
        cameraPermission: 'Allow Labaik Field to record job proof videos.',
        microphonePermission: 'Allow Labaik Field to record proof video audio.',
        recordAudioAndroid: true,
      },
    ],
  ],
});
