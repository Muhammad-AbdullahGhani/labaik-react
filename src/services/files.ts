import type * as LegacyFileTypes from 'expo-file-system/build/legacy';

// SDK 54's /legacy entry points at .ts implementation sources with incompatible
// optional-property annotations. Keep our strictness and use its published .d.ts
// for typing while Metro loads the documented runtime entry unchanged.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- SDK 54 declaration/runtime split explained above.
const files: typeof LegacyFileTypes = require('expo-file-system/legacy');
export default files;
