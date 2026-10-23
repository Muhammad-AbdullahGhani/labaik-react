import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { styles } from './styles';
export function LoginForm({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit() {
    if (busy) return;
    if (!email.trim().includes('@') || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onLogin(email.trim(), password);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.heading}>
        Sign in
      </Text>
      <TextInput
        accessibilityLabel="Email"
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        textContentType="username"
      />
      <TextInput
        accessibilityLabel="Password"
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        textContentType="password"
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {error}
        </Text>
      ) : null}
      <Button
        title={busy ? 'Signing in...' : 'Sign in'}
        disabled={busy}
        onPress={() => {
          void submit();
        }}
        color="#175b42"
      />
      <Text style={styles.subtle}>
        Use the seeded @labaik.test accounts. Password: DemoPass123!
      </Text>
      <Text style={styles.subtle}>Email sign-in only. Emulators must be running.</Text>
    </View>
  );
}
