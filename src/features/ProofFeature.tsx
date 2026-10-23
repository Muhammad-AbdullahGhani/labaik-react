import { lazy, Suspense } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { ProofJob } from '../lib/proofs';
import type { AccountScope } from '../lib/queue';
import { styles } from './styles';
const ProofPanel = lazy(() => import('./media/ProofPanel'));
export const hasMediaModules = () =>
  ['ExpoCamera', 'ExpoVideo', 'ExponentFileSystem', 'ExpoCrypto'].every(
    (name) => requireOptionalNativeModule(name) !== null,
  );
export function ProofFeature(props: {
  uid: string;
  job: ProofJob | null;
  scope: { current: AccountScope };
}) {
  if (!hasMediaModules())
    return (
      <View style={styles.card}>
        <Text style={styles.heading}>Video requires the new development APK</Text>
        <Text style={styles.text}>
          This APK can still show jobs and offers. Rebuild after the camera/video dependencies are
          added to use recording and playback.
        </Text>
      </View>
    );
  return (
    <Suspense fallback={<ActivityIndicator accessibilityLabel="Loading video tools" />}>
      <ProofPanel {...props} />
    </Suspense>
  );
}
