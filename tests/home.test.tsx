import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Button, TextInput } from 'react-native';
import { LoginForm } from '../src/features/LoginForm';

describe('email login UI', () => {
  it('renders an accessible login and blocks empty submissions', async () => {
    const onLogin = jest.fn();
    let screen: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        screen = create(<LoginForm onLogin={onLogin} />);
      });
      expect(screen?.root.findByProps({ accessibilityRole: 'header' }).props.children).toBe(
        'Sign in',
      );
      await act(async () => {
        await screen?.root.findByType(Button).props.onPress();
      });
      expect(onLogin).not.toHaveBeenCalled();
      expect(screen?.root.findByProps({ accessibilityRole: 'alert' }).props.children).toBe(
        'Enter your email and password.',
      );
    } finally {
      await act(async () => screen?.unmount());
    }
  });
  it('passes trimmed email and password to the supplied auth adapter', async () => {
    const onLogin = jest.fn().mockResolvedValue(undefined);
    let screen: ReactTestRenderer | undefined;
    try {
      await act(async () => {
        screen = create(<LoginForm onLogin={onLogin} />);
      });
      await act(async () => {
        const inputs = screen?.root.findAllByType(TextInput);
        inputs?.[0]?.props.onChangeText(' performer-a@labaik.test ');
        inputs?.[1]?.props.onChangeText('DemoPass123!');
      });
      await act(async () => {
        await screen?.root.findByType(Button).props.onPress();
      });
      expect(onLogin).toHaveBeenCalledWith('performer-a@labaik.test', 'DemoPass123!');
    } finally {
      await act(async () => screen?.unmount());
    }
  });
});
