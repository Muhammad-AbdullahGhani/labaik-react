import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import FileSystem from '../../services/files';
import { ref, writeToFile, type FirebaseStorageTypes } from '@react-native-firebase/storage';
import { randomUUID } from 'expo-crypto';
import { storage, auth } from '../../services/firebase';
import { styles } from '../styles';
import { errorMessage } from '../../lib/errors';
export function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  return (
    <VideoView
      player={player}
      nativeControls
      style={{ width: '100%', height: 240 }}
      contentFit="contain"
    />
  );
}
export function PrivateProofPlayer({ uid, path }: { uid: string; path: string }) {
  const [uri, setUri] = useState<string | null>(null),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const task = useRef<FirebaseStorageTypes.Task | null>(null),
    alive = useRef(true),
    local = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void task.current?.cancel().catch(() => {});
      if (local.current)
        void FileSystem.deleteAsync(local.current, { idempotent: true }).catch(() => {});
    };
  }, []);
  async function load() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      if (auth.currentUser?.uid !== uid || !FileSystem.cacheDirectory)
        throw Error('ACCOUNT_MISMATCH');
      const directory = `${FileSystem.cacheDirectory}proof-previews/${encodeURIComponent(uid)}/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      if (!alive.current || auth.currentUser?.uid !== uid) return;
      const destination = `${directory}${randomUUID()}.mp4`;
      local.current = destination;
      task.current = writeToFile(ref(storage, path), destination);
      const stop = task.current.on('state_changed', (snapshot) => {
        if (alive.current && auth.currentUser?.uid === uid)
          setProgress(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0);
      });
      try {
        await task.current;
      } finally {
        stop();
      }
      if (alive.current && auth.currentUser?.uid === uid) setUri(destination);
      else await FileSystem.deleteAsync(destination, { idempotent: true });
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
    } finally {
      if (alive.current) setLoading(false);
    }
  }
  return (
    <View style={{ gap: 10 }}>
      {uri ? (
        <VideoPreview key={uri} uri={uri} />
      ) : (
        <Button
          title={
            loading
              ? `Downloading privately ${Math.round(progress * 100)}%`
              : 'Load video for playback'
          }
          disabled={loading}
          onPress={() => {
            void load();
          }}
        />
      )}
      {loading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.message}>{error}</Text> : null}
      <Text style={styles.subtle}>
        Playback uses an authenticated Storage download; no permanent download URL is saved.
      </Text>
    </View>
  );
}
