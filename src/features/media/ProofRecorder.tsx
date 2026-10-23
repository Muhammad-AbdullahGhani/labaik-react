import { useEffect, useRef, useState } from 'react';
import { AppState, Button, Linking, Text, View } from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
} from 'expo-camera';
import FileSystem from '../../services/files';
import { styles } from '../styles';
import { VideoPreview } from './VideoPreview';
import { errorMessage } from '../../lib/errors';
import { MAX_PROOF_BYTES } from '../../lib/proofs';
export function ProofRecorder({
  label,
  isCurrent,
  onSave,
  onCancel,
}: {
  label: string;
  isCurrent: () => boolean;
  onSave: (uri: string, duration: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions(),
    [audio, requestAudio] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back'),
    [ready, setReady] = useState(false),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [draft, setDraft] = useState<{ uri: string; duration: number } | null>(null),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const camera = useRef<CameraView | null>(null),
    recordingCamera = useRef<CameraView | null>(null),
    recordingRef = useRef(false),
    alive = useRef(true),
    start = useRef(0),
    draftRef = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    const background = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && recordingRef.current) {
        try {
          camera.current?.stopRecording();
        } catch {}
      }
    });
    return () => {
      alive.current = false;
      background.remove();
      try {
        if (recordingRef.current) recordingCamera.current?.stopRecording();
      } catch {}
      if (draftRef.current)
        void FileSystem.deleteAsync(draftRef.current, { idempotent: true }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(
      () => setSeconds(Math.min(180, Math.floor((performance.now() - start.current) / 1000))),
      250,
    );
    return () => clearInterval(timer);
  }, [recording]);
  async function record() {
    if (!ready || recordingRef.current || !camera.current || !isCurrent()) return;
    recordingRef.current = true;
    recordingCamera.current = camera.current;
    setRecording(true);
    setSeconds(0);
    setError('');
    start.current = performance.now();
    try {
      const result = await camera.current.recordAsync({
        maxDuration: 180,
        maxFileSize: MAX_PROOF_BYTES,
      });
      if (!result?.uri) throw Error('Recording was interrupted. Try again.');
      if (!alive.current || !isCurrent()) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        return;
      }
      draftRef.current = result.uri;
      setDraft({
        uri: result.uri,
        duration: Math.min(180000, Math.max(1, performance.now() - start.current)),
      });
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
    } finally {
      recordingRef.current = false;
      recordingCamera.current = null;
      if (alive.current) setRecording(false);
    }
  }
  async function retake() {
    if (draftRef.current) await FileSystem.deleteAsync(draftRef.current, { idempotent: true });
    draftRef.current = null;
    setDraft(null);
    setReady(false);
  }
  async function save() {
    if (!draft || saving || !isCurrent()) return;
    setSaving(true);
    setError('');
    try {
      await onSave(draft.uri, draft.duration);
      if (alive.current) onCancel();
    } catch (error) {
      if (alive.current) setError(errorMessage(error));
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  if (!permission?.granted || !audio?.granted)
    return (
      <View style={styles.card}>
        <Text style={styles.text}>Camera and microphone access are required to record proof.</Text>
        <Button
          title="Allow camera and microphone"
          onPress={() => {
            void (async () => {
              await requestPermission();
              await requestAudio();
            })();
          }}
        />
        <Button
          title="Open permission settings"
          onPress={() => {
            void Linking.openSettings();
          }}
        />
        <Button title="Cancel" onPress={onCancel} />
      </View>
    );
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Record: {label}</Text>
      {draft ? (
        <>
          <VideoPreview key={draft.uri} uri={draft.uri} />
          <Button
            title="Retake"
            onPress={() => {
              void retake();
            }}
            disabled={saving}
          />
          <Button
            title={saving ? 'Saving securely...' : 'Save and upload'}
            onPress={() => {
              void save();
            }}
            disabled={saving}
          />
        </>
      ) : (
        <>
          <CameraView
            key={facing}
            ref={camera}
            style={{ height: 300, width: '100%' }}
            mode="video"
            facing={facing}
            videoQuality="720p"
            videoBitrate={2000000}
            onCameraReady={() => setReady(true)}
            onMountError={(event) => setError(event.message)}
          />
          <Text style={styles.heading}>
            {recording ? `Recording ${seconds}s / 180s` : 'Ready to record'}
          </Text>
          <Button
            title={facing === 'back' ? 'Switch to front camera' : 'Switch to back camera'}
            disabled={recording}
            onPress={() => {
              setReady(false);
              setFacing((value) => (value === 'back' ? 'front' : 'back'));
            }}
          />
          {recording ? (
            <Button
              title="Stop recording"
              onPress={() => {
                try {
                  camera.current?.stopRecording();
                } catch {}
              }}
            />
          ) : (
            <Button
              title="Start recording"
              disabled={!ready}
              onPress={() => {
                void record();
              }}
            />
          )}
        </>
      )}
      <Text style={styles.subtle}>
        720p target, maximum 3 minutes or 60 MiB. Encoder bitrate is a target; post-recording
        compression is not included.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {error}
        </Text>
      ) : null}
      <Button title="Cancel recording" disabled={saving} onPress={onCancel} />
    </View>
  );
}
