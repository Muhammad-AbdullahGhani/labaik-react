import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Labaik Field
        </Text>
        <Text style={styles.description}>Your field companion in Makkah and Madinah.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f6f2' },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: '600', color: '#173f35' },
  description: { fontSize: 18, lineHeight: 28, color: '#42534d' },
});
