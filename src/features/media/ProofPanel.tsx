import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Button, Switch, Text, View } from 'react-native';
import { UploadWorker, type UploadQueue, type ProofUpload } from '../../lib/uploads';
import { type AccountScope } from '../../lib/queue';
import type { ProofJob } from '../../lib/proofs';
import {
  getUploadQueue,
  persistRecording,
  transferVideo,
  removeUploadedFile,
} from '../../services/uploads';
import { errorMessage } from '../../lib/errors';
import { styles } from '../styles';
import { ProofRecorder } from './ProofRecorder';
import { PrivateProofPlayer } from './VideoPreview';
import { call } from '../../services/api';
export default function ProofPanel({
  uid,
  job,
  scope,
}: {
  uid: string;
  job: ProofJob | null;
  scope: { current: AccountScope };
}) {
  const [queue, setQueue] = useState<UploadQueue | null>(null),
    [rows, setRows] = useState<ProofUpload[]>([]),
    [recordingStep, setRecordingStep] = useState<string | null>(null),
    [message, setMessage] = useState(''),
    [paused, setPaused] = useState(false),
    [playing, setPlaying] = useState<string | null>(null);
  const worker = useRef<UploadWorker | null>(null),
    pausedRef = useRef(false);
  useEffect(() => {
    let active = true;
    void getUploadQueue()
      .then((value) => {
        if (active) setQueue(value);
      })
      .catch((error) => {
        if (active) setMessage(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!queue) return;
    let active = true;
    const instance = new UploadWorker(
      queue,
      () => scope.current,
      transferVideo,
      removeUploadedFile,
    );
    worker.current = instance;
    async function refresh() {
      try {
        if (!pausedRef.current && AppState.currentState === 'active') await instance.run();
        if (active && scope.current.uid === uid) setRows(await queue!.list(uid));
      } catch (error) {
        if (active) setMessage(errorMessage(error));
      }
    }
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);
    const lifecycle = AppState.addEventListener('change', (state) => {
      if (state !== 'active') instance.stop();
      else void refresh();
    });
    return () => {
      active = false;
      clearInterval(timer);
      lifecycle.remove();
      instance.stop();
      worker.current = null;
    };
  }, [queue, uid, scope]);
  async function save(uri: string, duration: number) {
    if (!job || !recordingStep || scope.current.uid !== uid) throw Error('ACCOUNT_MISMATCH');
    await persistRecording(uid, job.id, job.version, recordingStep, uri, duration);
    if (scope.current.uid === uid)
      setMessage('Recording saved on-device. Foreground upload will retry safely.');
  }
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Proof videos
      </Text>
      <View style={styles.row}>
        <Text style={styles.text}>Pause video uploads</Text>
        <Switch
          accessibilityLabel="Pause video uploads"
          value={paused}
          onValueChange={(value) => {
            pausedRef.current = value;
            setPaused(value);
            if (value) worker.current?.stop();
          }}
        />
      </View>
      <Text style={styles.subtle}>
        Foreground transfers only. Keep the app open. Local files survive restarts; a restart may
        restart the transfer, never overwrite a finished object.
      </Text>
      {job &&
        job.requiredSteps.map((stepId, index) => {
          const record = job.proofs?.[stepId];
          const current = record?.jobVersion === job.version ? record : undefined;
          const outstanding = rows.some(
            (row) =>
              row.jobId === job.id &&
              row.jobVersion === job.version &&
              row.stepId === stepId &&
              ['queued', 'uploading', 'retry'].includes(row.status),
          );
          const canRecord =
            ['arrived', 'proof'].includes(job.status) &&
            !outstanding &&
            (!current || ['rejected', 'cancelled'].includes(current.status));
          return (
            <View key={stepId} style={styles.card}>
              <Text style={styles.heading}>{job.proofLabels?.[index] ?? stepId}</Text>
              <Text style={styles.text}>{current?.status ?? 'Not recorded'}</Text>
              {current?.rejectionReason ? (
                <Text style={styles.message}>Rejected: {current.rejectionReason}</Text>
              ) : null}
              <Button
                title={current?.status === 'rejected' ? 'Record replacement' : 'Record video'}
                disabled={!canRecord || recordingStep !== null}
                onPress={() => {
                  setMessage('');
                  setRecordingStep(stepId);
                }}
              />
              {current && ['uploaded', 'approved', 'rejected'].includes(current.status) ? (
                <>
                  <Button
                    title={playing === stepId ? 'Close video' : 'Preview uploaded video'}
                    onPress={() => setPlaying((value) => (value === stepId ? null : stepId))}
                  />
                  {playing === stepId ? (
                    <PrivateProofPlayer
                      key={`${uid}-${current.attemptId}`}
                      uid={uid}
                      path={current.path}
                    />
                  ) : null}
                </>
              ) : null}
            </View>
          );
        })}
      {recordingStep && job ? (
        <ProofRecorder
          key={`${uid}-${job.id}-${recordingStep}`}
          label={job.proofLabels?.[job.requiredSteps.indexOf(recordingStep)] ?? recordingStep}
          isCurrent={() => scope.current.uid === uid}
          onSave={save}
          onCancel={() => setRecordingStep(null)}
        />
      ) : null}
      {rows
        .filter((row) => !job || row.jobId === job.id)
        .map((row) => (
          <View style={styles.card} key={row.attemptId}>
            <Text style={styles.text}>
              {row.stepId}: {row.status} / {Math.round(row.progress * 100)}%
            </Text>
            <Text style={styles.subtle}>
              {(row.size / 1048576).toFixed(1)} MiB / retries {row.attempts}
            </Text>
            {row.error ? <Text style={styles.message}>{row.error}</Text> : null}
            {['failed', 'retry'].includes(row.status) ? (
              <>
                <Button
                  title="Retry this upload"
                  onPress={() => {
                    void queue?.retry(row).catch((error) => setMessage(errorMessage(error)));
                  }}
                />
                <Button
                  title="Discard failed upload and retake"
                  onPress={() =>
                    Alert.alert(
                      'Discard failed recording?',
                      'The local copy will be removed. A replacement will use a new object path.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Discard',
                          style: 'destructive',
                          onPress: () => {
                            void (async () => {
                              try {
                                worker.current?.stop();
                                if (scope.current.uid !== uid) return;
                                await call('cancelProofUpload', {
                                  uid,
                                  jobId: row.jobId,
                                  stepId: row.stepId,
                                  attemptId: row.attemptId,
                                  jobVersion: row.jobVersion,
                                });
                                await queue?.state(row, 'discarded');
                                await removeUploadedFile(row);
                                if (scope.current.uid === uid && queue)
                                  setRows(await queue.list(uid));
                              } catch (error) {
                                setMessage(errorMessage(error));
                              }
                            })();
                          },
                        },
                      ],
                    )
                  }
                />
              </>
            ) : null}
          </View>
        ))}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}
