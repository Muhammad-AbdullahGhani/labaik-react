import { useEffect, useRef, useState } from 'react';
import {
  getIdTokenResult,
  onAuthStateChanged,
  signOut,
  type FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { auth, db } from '../services/firebase';
import { errorMessage } from '../services/api';
import type { AccountScope } from '../lib/queue';
export interface Profile {
  email: string;
  role: 'performer' | 'supervisor';
  status: 'pending' | 'approved' | 'suspended';
}
export function useSession() {
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const scope = useRef<AccountScope>({ uid: null, epoch: 0 });
  useEffect(
    () =>
      onAuthStateChanged(auth, (next) => {
        scope.current = { uid: next?.uid ?? null, epoch: scope.current.epoch + 1 };
        setUser(next);
        setProfile(null);
        setReady(false);
        setLoading(false);
        setError('');
      }),
    [],
  );
  useEffect(() => {
    if (!user) return;
    let active = true;
    let revision = 0;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (!active) return;
        const currentRevision = ++revision;
        const data = snapshot.data() as Profile | undefined;
        if (!data) {
          setReady(false);
          setProfile({ email: user.email ?? '', role: 'performer', status: 'pending' });
          return;
        }
        setProfile(data);
        if (data.status !== 'approved') {
          setReady(false);
          return;
        }
        // Failed refresh while disconnected must never sign out a cached session.
        void getIdTokenResult(user, true)
          .catch(() => getIdTokenResult(user, false))
          .then((token) => {
            if (active && revision === currentRevision) {
              setReady(token.claims.role === data.role);
              setError(
                token.claims.role === data.role ? '' : 'Waiting for updated role credentials.',
              );
            }
          })
          .catch((error) => {
            if (active && revision === currentRevision) setError(errorMessage(error));
          });
      },
      (error) => {
        if (active) setError(errorMessage(error));
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user]);
  async function logout() {
    scope.current = { uid: null, epoch: scope.current.epoch + 1 };
    try {
      await signOut(auth);
    } catch (error) {
      scope.current = { uid: auth.currentUser?.uid ?? null, epoch: scope.current.epoch + 1 };
      throw error;
    }
  }
  return { user, profile, ready, loading, error, scope, logout };
}
