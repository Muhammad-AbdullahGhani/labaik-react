// Public identification metadata for local emulators only. Not a production Firebase config.
const fs = require('node:fs');
const destination = 'google-services.json';
if (fs.existsSync(destination)) {
  throw new Error(
    'google-services.json already exists; refusing to overwrite your Firebase config.',
  );
}
const config = {
  project_info: {
    project_number: '123456789012',
    project_id: 'demo-labaik-field',
    storage_bucket: 'demo-labaik-field.appspot.com',
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: '1:123456789012:android:0123456789abcdef012345',
        android_client_info: { package_name: 'com.abdullahghani.labaikfield' },
      },
      api_key: [{ current_key: 'AIzaSyDemoOnlyNotARealFirebaseApiKey12345' }],
    },
  ],
  configuration_version: '1',
};
fs.writeFileSync(destination, JSON.stringify(config, null, 2) + '\n');
console.log('Created gitignored emulator-only config. Keep EXPO_PUBLIC_USE_EMULATORS=true.');
