import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import HomeScreen from '../app/index';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { SafeAreaView: View };
});

describe('initial app route', () => {
  it('renders the app heading without requiring a Firebase connection', async () => {
    let screen: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        screen = create(<HomeScreen />);
      });
      expect(screen?.root.findByProps({ accessibilityRole: 'header' }).props.children).toBe(
        'Labaik Field',
      );
    } finally {
      await act(async () => screen?.unmount());
    }
  });
});
