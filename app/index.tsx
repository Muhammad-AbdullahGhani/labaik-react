import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Button,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword } from '@react-native-firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { auth, db } from '../src/services/firebase';
import { call, errorMessage, sendAction } from '../src/services/api';
import { getQueue } from '../src/services/queue';
import { ActionQueue, ReplayEngine, type ActionKind, type QueueRow } from '../src/lib/queue';
import { useSession } from '../src/features/useSession';
import { LoginForm } from '../src/features/LoginForm';
import { styles } from '../src/features/styles';
import { CreateJobForm } from '../src/features/CreateJobForm';
import { ProofFeature } from '../src/features/ProofFeature';
import type { ProofJob } from '../src/lib/proofs';

interface Offer {
  id: string;
  jobId: string;
  round: number;
  expiresAt: number;
  title?: string;
  fee?: number;
}
interface Job extends ProofJob {
  id: string;
  title: string;
  status: string;
  version: number;
  requiredSteps: string[];
  location: { latitude: number; longitude: number };
}
interface Pending {
  id: string;
  email: string;
}
const stages = ['accepted', 'started', 'arrived', 'proof', 'complete'];
const resultStage: Record<ActionKind, string> = {
  start: 'started',
  arrive: 'arrived',
  proof: 'proof',
  complete: 'complete',
};
const labels: Record<ActionKind, string> = {
  start: 'Queue start',
  arrive: 'Queue arrive (sample fix)',
  proof: 'Queue proof marker',
  complete: 'Queue complete',
};
export default function HomeScreen() {
  const session = useSession();
  const { user, profile, ready, scope } = session;
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]),
    [offers, setOffers] = useState<Offer[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null),
    [job, setJob] = useState<Job | null>(null);
  const [queue, setQueue] = useState<ActionQueue | null>(null),
    [rows, setRows] = useState<QueueRow[]>([]),
    [paused, setPaused] = useState(false);
  const [clock, setClock] = useState<{ server: number; mono: number } | null>(null),
    [mono, setMono] = useState(performance.now());
  const busyRef = useRef(false);
  const engine = useMemo(
    () => (queue ? new ReplayEngine(queue, () => scope.current, sendAction) : null),
    [queue, scope],
  );
  const refresh = useCallback(async () => {
    const uid = scope.current.uid;
    if (!queue || !uid) {
      setRows([]);
      return;
    }
    const next = await queue.list(uid);
    if (scope.current.uid === uid) setRows(next);
  }, [queue, scope]);
  const run = useCallback(
    async (work: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setMessage('');
      const epoch = scope.current.epoch;
      try {
        await work();
      } catch (error) {
        if (scope.current.epoch === epoch) setMessage(errorMessage(error));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [scope],
  );
  useEffect(() => {
    let active = true;
    void getQueue()
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
    setMessage('');
    setRows([]);
    setClock(null);
  }, [user?.uid]);
  useEffect(() => {
    setOffers([]);
    setPending([]);
    setActiveJobId(null);
    if (!user || !ready) return;
    if (profile?.role === 'supervisor')
      return onSnapshot(
        query(collection(db, 'users'), where('status', '==', 'pending')),
        (snapshot) =>
          setPending(
            snapshot.docs.map((item: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({
              id: item.id,
              email: String(item.data().email ?? item.id),
            })),
          ),
        (error) => setMessage(errorMessage(error)),
      );
    const stopOffers = onSnapshot(
      query(
        collection(db, 'offers'),
        where('performerId', '==', user.uid),
        where('status', '==', 'pending'),
      ),
      (snapshot) =>
        setOffers(
          snapshot.docs.map((item: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
            const value = item.data();
            return {
              id: item.id,
              jobId: String(value.jobId),
              round: Number(value.round ?? 0),
              expiresAt: value.expiresAt?.toMillis() ?? 0,
              ...(value.summary?.title ? { title: String(value.summary.title) } : {}),
              ...(typeof value.summary?.fee === 'number' ? { fee: value.summary.fee } : {}),
            };
          }),
        ),
      (error) => setMessage(errorMessage(error)),
    );
    const stopLock = onSnapshot(
      doc(db, 'activeJobs', user.uid),
      (snapshot) => {
        const value = snapshot.data()?.jobId;
        setActiveJobId(typeof value === 'string' ? value : null);
      },
      (error) => setMessage(errorMessage(error)),
    );
    return () => {
      stopOffers();
      stopLock();
    };
  }, [user, ready, profile?.role]);
  useEffect(() => {
    setJob(null);
    if (!activeJobId || !ready) return;
    return onSnapshot(
      doc(db, 'jobs', activeJobId),
      (snapshot) => {
        if (snapshot.exists()) setJob({ ...snapshot.data(), id: snapshot.id } as Job);
      },
      (error) => setMessage(errorMessage(error)),
    );
  }, [activeJobId, ready]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function calibrate() {
      const start = performance.now();
      try {
        const result = await call<{ serverTime: number }>('getServerTime');
        const end = performance.now();
        if (active) {
          setClock({ server: result.serverTime + (end - start) / 2, mono: end });
          setMono(end);
        }
      } catch (error) {
        if (active) setMessage(errorMessage(error));
      }
    }
    void calibrate();
    const calibration = setInterval(() => {
      void calibrate();
    }, 30000);
    const timer = setInterval(() => setMono(performance.now()), 500);
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void calibrate();
    });
    return () => {
      active = false;
      clearInterval(calibration);
      clearInterval(timer);
      foreground.remove();
    };
  }, [ready, user?.uid]);
  useEffect(() => {
    if (!engine || !user || !ready || profile?.role !== 'performer') return;
    let active = true;
    async function tick() {
      try {
        if (!paused) await engine?.replay();
        if (active) await refresh();
      } catch (error) {
        if (active) setMessage(errorMessage(error));
      }
    }
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [engine, user, ready, profile?.role, paused, refresh]);
  async function enqueue(kind: ActionKind) {
    if (!queue || !job || !user || scope.current.uid !== user.uid)
      throw Error('No active job/account.');
    const payload: Record<string, unknown> =
      kind === 'arrive'
        ? { ...job.location, accuracy: 10 }
        : kind === 'proof'
          ? { stepId: job.requiredSteps[0] }
          : {};
    await queue.enqueue({
      id: `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
      uid: user.uid,
      jobId: job.id,
      jobVersion: job.version,
      kind,
      payload,
    });
    await refresh();
    setMessage('Action saved in SQLite. Replay keeps the same action ID.');
  }
  let stage = job?.status ?? '';
  for (const row of rows.filter((row) => row.jobId === job?.id && row.jobVersion === job?.version))
    if (stages.indexOf(resultStage[row.kind]) > stages.indexOf(stage))
      stage = resultStage[row.kind];
  const next: Record<string, ActionKind> = {
    accepted: 'start',
    started: 'arrive',
    arrived: 'proof',
    proof: 'complete',
  };
  const blocked = rows.some(
    (row) =>
      row.status === 'conflict' ||
      row.status === 'failed' ||
      (row.status !== 'applied' && row.jobId === job?.id && row.jobVersion !== job?.version),
  );
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.title}>
          Labaik Field
        </Text>
        <Text style={styles.subtle}>Emulator demo / performer operations</Text>
        {session.loading ? (
          <ActivityIndicator accessibilityLabel="Restoring session" />
        ) : !user ? (
          <LoginForm
            onLogin={async (email, password) => {
              await signInWithEmailAndPassword(auth, email, password);
            }}
          />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.text}>{user.email}</Text>
              <Text style={styles.subtle}>
                {profile?.role ?? 'Loading role'} / {profile?.status ?? 'Loading status'}
              </Text>
              <Button
                title="Sign out"
                onPress={() => {
                  void run(session.logout);
                }}
                disabled={busy}
              />
            </View>
            {session.error ? (
              <Text accessibilityRole="alert" style={styles.message}>
                {session.error}
              </Text>
            ) : null}
            {!profile ? (
              <ActivityIndicator accessibilityLabel="Loading account" />
            ) : profile.status !== 'approved' ? (
              <View style={styles.card}>
                <Text accessibilityRole="header" style={styles.heading}>
                  {profile.status === 'suspended' ? 'Account suspended' : 'Approval pending'}
                </Text>
                <Text style={styles.text}>
                  A supervisor must approve your account before you can access offers or jobs.
                </Text>
              </View>
            ) : !ready ? (
              <Text style={styles.text}>Refreshing role credentials...</Text>
            ) : profile.role === 'supervisor' ? (
              <View style={styles.card}>
                <CreateJobForm onCreate={(data) => call('createJob', data)} />
                <Text accessibilityRole="header" style={styles.heading}>
                  Pending performers
                </Text>
                {!pending.length ? (
                  <Text style={styles.text}>No pending approvals.</Text>
                ) : (
                  pending.map((item) => (
                    <View key={item.id} style={styles.card}>
                      <Text style={styles.text}>{item.email}</Text>
                      <Button
                        title={`Approve ${item.id}`}
                        disabled={busy}
                        onPress={() => {
                          void run(async () => {
                            await call('approveUser', { uid: item.id });
                            setMessage('Performer approved. Role claim updated.');
                          });
                        }}
                      />
                    </View>
                  ))
                )}
                <Button
                  title="Run expired-offer sweep (emulator)"
                  disabled={busy}
                  onPress={() => {
                    void run(async () => {
                      const result = await call<{ moved: number }>('runExpirySweep');
                      setMessage(`Sweep moved ${result.moved} expired offer(s).`);
                    });
                  }}
                />
                <Text style={styles.subtle}>
                  Scheduling is not emulated. This runs the scheduled function&apos;s transaction
                  logic.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.heading}>
                    Live offers
                  </Text>
                  {!offers.length ? (
                    <Text style={styles.text}>
                      No current offers. Re-seed or wait for the next round.
                    </Text>
                  ) : (
                    offers.map((offer) => {
                      const remaining = clock
                        ? Math.max(
                            0,
                            Math.ceil(
                              (offer.expiresAt - clock.server - (mono - clock.mono)) / 1000,
                            ),
                          )
                        : null;
                      return (
                        <View key={`${offer.id}-${offer.round}`} style={styles.card}>
                          <Text style={styles.text}>
                            {offer.title ? `${offer.title}\n` : ''}
                            Job {offer.jobId} / round {offer.round + 1}
                          </Text>
                          {offer.fee !== undefined ? (
                            <Text style={styles.text}>{(offer.fee / 100).toFixed(2)} SAR</Text>
                          ) : null}
                          <Text accessibilityLiveRegion="polite" style={styles.heading}>
                            {remaining === null
                              ? 'Calibrating server time...'
                              : remaining === 0
                                ? 'Offer expired'
                                : `${remaining}s remaining`}
                          </Text>
                          <Button
                            title="Accept"
                            disabled={
                              busy || remaining === null || remaining === 0 || !!activeJobId
                            }
                            onPress={() => {
                              void run(async () => {
                                const result = await call<{ jobId: string }>('acceptOffer', {
                                  offerId: offer.id,
                                  round: offer.round,
                                });
                                setMessage(
                                  `Accepted ${result.jobId}. Repeated requests return the same result.`,
                                );
                              });
                            }}
                            color="#175b42"
                          />
                          <Button
                            title="Decline"
                            disabled={busy}
                            onPress={() => {
                              void run(async () => {
                                const result = await call<{ moved: boolean }>('declineOffer', {
                                  offerId: offer.id,
                                  round: offer.round,
                                });
                                setMessage(
                                  result.moved
                                    ? 'Offer declined and advanced.'
                                    : 'Offer already changed; nothing was changed by this retry.',
                                );
                              });
                            }}
                          />
                          <Text style={styles.subtle}>
                            Countdown uses server time plus monotonic elapsed time. The server
                            decides the deadline.
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
                <View style={styles.card}>
                  <Text accessibilityRole="header" style={styles.heading}>
                    Offline queue
                  </Text>
                  <View style={styles.row}>
                    <Text style={styles.text}>Pause replay (demo offline)</Text>
                    <Switch
                      accessibilityLabel="Pause queue replay"
                      value={paused}
                      onValueChange={(value) => {
                        scope.current = { ...scope.current, epoch: scope.current.epoch + 1 };
                        setPaused(value);
                      }}
                    />
                  </View>
                  <Text style={styles.subtle}>
                    {paused
                      ? 'Actions are saved locally. Resume replay to sync.'
                      : 'Automatic ordered replay every 2 seconds; network failures back off.'}
                  </Text>
                  {job ? (
                    <>
                      <Text style={styles.text}>
                        {job.title} / server: {job.status} / local: {stage} / version {job.version}
                      </Text>
                      <Text style={styles.subtle}>
                        Arrival uses job coordinates plus 10 m accuracy as a labelled sample, not
                        live GPS. Record and upload the required videos below before completion.
                      </Text>
                      {(['start', 'arrive', 'complete'] as const).map((kind) => (
                        <Button
                          key={kind}
                          title={labels[kind]}
                          disabled={
                            busy ||
                            blocked ||
                            next[stage] !== kind ||
                            (kind === 'complete' &&
                              !job.requiredSteps.every(
                                (step) =>
                                  ['uploaded', 'approved'].includes(
                                    job.proofs?.[step]?.status ?? '',
                                  ) && job.proofs?.[step]?.jobVersion === job.version,
                              ))
                          }
                          onPress={() => {
                            void run(() => enqueue(kind));
                          }}
                        />
                      ))}
                    </>
                  ) : (
                    <Text style={styles.text}>Accept a job to queue its actions.</Text>
                  )}
                  <ProofFeature key={user.uid} uid={user.uid} job={job} scope={scope} />
                  {blocked ? (
                    <Text accessibilityRole="alert" style={styles.message}>
                      Replay is blocked. Review the changed job or failed action. Local actions are
                      retained.
                    </Text>
                  ) : null}
                  <Button
                    title="Replay now"
                    disabled={busy || paused || !queue}
                    onPress={() => {
                      void run(async () => {
                        await engine?.replay();
                        await refresh();
                      });
                    }}
                  />
                  {!rows.length ? (
                    <Text style={styles.subtle}>No queued actions for this account.</Text>
                  ) : (
                    rows.map((row) => (
                      <View key={row.id} style={styles.card}>
                        <Text style={styles.text}>
                          #{row.sequence} {row.kind} / {row.status}
                        </Text>
                        <Text selectable style={styles.subtle}>
                          {row.id}
                        </Text>
                        <Text style={styles.subtle}>
                          Retries: {row.attempts}
                          {row.nextAttemptAt
                            ? ` / next attempt ${new Date(row.nextAttemptAt).toLocaleTimeString()}`
                            : ''}
                        </Text>
                        {row.error ? <Text style={styles.message}>{row.error}</Text> : null}
                      </View>
                    ))
                  )}
                  <Button
                    title="Reset this account's local demo queue"
                    disabled={!paused || !queue || busy || !rows.length}
                    onPress={() =>
                      Alert.alert(
                        'Discard local demo actions?',
                        'This only clears this account on this device. Server job state is kept. Use after re-seeding or reviewing a conflict.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Discard',
                            style: 'destructive',
                            onPress: () => {
                              scope.current = { ...scope.current, epoch: scope.current.epoch + 1 };
                              void run(async () => {
                                const uid = scope.current.uid;
                                if (queue && uid) {
                                  await queue.clear(uid);
                                  await refresh();
                                  if (scope.current.uid === uid)
                                    setMessage('Local demo queue cleared for this account.');
                                }
                              });
                            },
                          },
                        ],
                      )
                    }
                  />
                </View>
              </>
            )}
          </>
        )}
        {message ? (
          <Text accessibilityRole="alert" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
