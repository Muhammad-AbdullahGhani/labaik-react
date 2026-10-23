import { useRef, useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { parseJobDraft, type JobDraft } from '../../functions/src/domain/job';
import { styles } from './styles';
import { errorMessage } from '../lib/errors';

export function CreateJobForm({
  onCreate,
}: {
  onCreate: (data: {
    requestId: string;
    job: JobDraft;
  }) => Promise<{ jobId: string; performerId: string }>;
}) {
  const [fields, setFields] = useState({
    title: 'Field visit',
    fee: '150',
    latitude: '21.4225',
    longitude: '39.8262',
    delay: '0',
    duration: '60',
    proofs: 'Show completed work',
  });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const pending = useRef<{ requestId: string; job: JobDraft } | null>(null);
  function change(key: keyof typeof fields, value: string) {
    pending.current = null;
    setFields((previous) => ({ ...previous, [key]: value }));
  }
  async function submit() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (!pending.current) {
        if (
          [fields.fee, fields.latitude, fields.longitude, fields.delay, fields.duration].some(
            (value) => !value.trim(),
          )
        )
          throw Error('Fill every numeric field.');
        const startsAt = Date.now() + Number(fields.delay) * 60_000;
        const job = parseJobDraft({
          title: fields.title,
          fee: Math.round(Number(fields.fee) * 100),
          currency: 'SAR',
          location: { latitude: Number(fields.latitude), longitude: Number(fields.longitude) },
          startsAt,
          endsAt: startsAt + Number(fields.duration) * 60_000,
          proofLabels: fields.proofs.split('\n').filter((value) => value.trim()),
        });
        pending.current = {
          requestId: `create-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          job,
        };
      }
      const result = await onCreate(pending.current);
      pending.current = null;
      setMessage(`Created ${result.jobId}. Offered to ${result.performerId}.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const inputs: [keyof typeof fields, string][] = [
    ['title', 'Job title'],
    ['fee', 'Fee (SAR)'],
    ['latitude', 'Latitude'],
    ['longitude', 'Longitude'],
    ['delay', 'Starts in minutes'],
    ['duration', 'Window duration in minutes'],
    ['proofs', 'Proof steps (one per line)'],
  ];
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Create a job
      </Text>
      {inputs.map(([key, label]) => (
        <View key={key}>
          <Text style={styles.subtle}>{label}</Text>
          <TextInput
            accessibilityLabel={label}
            style={styles.input}
            value={fields[key]}
            onChangeText={(value) => change(key, value)}
            editable={!busy}
            multiline={key === 'proofs'}
            keyboardType={['title', 'proofs'].includes(key) ? 'default' : 'numbers-and-punctuation'}
          />
        </View>
      ))}
      <Button
        title={busy ? 'Creating...' : 'Create and offer job'}
        disabled={busy}
        onPress={() => {
          void submit();
        }}
      />
      <Text style={styles.subtle}>
        Coordinates are editable. One to five proof steps; fee is stored as integer minor units.
      </Text>
      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
