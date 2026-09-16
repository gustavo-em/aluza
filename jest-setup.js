/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  // The mock shipped by the package is ESM and is not transformed here, so the
  // suite uses a minimal in-memory store with the same contract.
  const store = new Map();

  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
      getAllKeys: jest.fn(async () => [...store.keys()]),
      setItem: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async key => {
        store.delete(key);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const { Animated, Easing } = require('react-native');

  return {
    __esModule: true,
    default: Animated,
    Easing,
    ReduceMotion: { System: 'system' },
    cancelAnimation: () => undefined,
    useAnimatedStyle: updater => updater(),
    useAnimatedProps: updater => updater(),
    useDerivedValue: updater => ({ value: updater() }),
    useReducedMotion: () => false,
    useSharedValue: initialValue => ({ value: initialValue }),
    interpolateColor: (_value, _input, output) => output[output.length - 1],
    // The animation helpers all resolve to the value they animate towards, so
    // a test sees the finished state rather than a frame of the transition.
    withTiming: targetValue => targetValue,
    withSpring: targetValue => targetValue,
    withDelay: (_delay, animation) => animation,
    withSequence: (...animations) => animations[animations.length - 1],
    withRepeat: animation => animation,
    runOnJS: fn => fn,
    FadeIn: makeAnimationBuilder(),
    FadeOut: makeAnimationBuilder(),
    FadeInDown: makeAnimationBuilder(),
    SlideInDown: makeAnimationBuilder(),
    SlideInRight: makeAnimationBuilder(),
    SlideOutDown: makeAnimationBuilder(),
    SlideOutLeft: makeAnimationBuilder(),
    SlideOutRight: makeAnimationBuilder(),
    LinearTransition: makeAnimationBuilder(),
    useAnimatedKeyboard: () => ({ height: { value: 0 } }),
    // A frame callback never runs under the test renderer: what it writes is
    // animation state, and every test reads the finished posture instead.
    useFrameCallback: () => ({ setActive: () => undefined }),
  };

  function makeAnimationBuilder() {
    const builder = {
      delay: () => builder,
      duration: () => builder,
      easing: () => builder,
      reduceMotion: () => builder,
      springify: () => builder,
      damping: () => builder,
      stiffness: () => builder,
    };

    return builder;
  }
});

jest.mock('lottie-react-native', () => {
  // The native view is replaced by a plain View that keeps the props a test
  // asserts on (source, autoPlay, loop, progress, testID).
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: props => React.createElement(View, props),
  };
});

jest.mock('@notifee/react-native', () => {
  // Scheduled reminders live here, so a test can read what the phone would be
  // holding instead of guessing from the calls.
  const triggers = new Map();

  return {
    __esModule: true,
    AndroidImportance: { DEFAULT: 3 },
    AuthorizationStatus: { DENIED: 0, AUTHORIZED: 1, PROVISIONAL: 2 },
    TriggerType: { TIMESTAMP: 0, INTERVAL: 1 },
    __triggers: triggers,
    default: {
      createChannel: jest.fn(async () => 'project-activity'),
      displayNotification: jest.fn(async () => undefined),
      getNotificationSettings: jest.fn(async () => ({
        authorizationStatus: 1,
      })),
      openNotificationSettings: jest.fn(async () => undefined),
      requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
      createTriggerNotification: jest.fn(async (notification, trigger) => {
        triggers.set(notification.id, { notification, trigger });
      }),
      getTriggerNotificationIds: jest.fn(async () => [...triggers.keys()]),
      cancelTriggerNotifications: jest.fn(async ids => {
        for (const id of ids) triggers.delete(id);
      }),
    },
  };
});

jest.mock('react-native-background-fetch', () => ({
  __esModule: true,
  default: {
    NETWORK_TYPE_ANY: 0,
    configure: jest.fn(async () => 2),
    finish: jest.fn(),
    registerHeadlessTask: jest.fn(),
  },
}));

jest.mock('@react-native-firebase/analytics', () => ({
  __esModule: true,
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(async () => undefined),
  logScreenView: jest.fn(async () => undefined),
  setUserId: jest.fn(async () => undefined),
}));

jest.mock('@react-native-firebase/crashlytics', () => ({
  __esModule: true,
  getCrashlytics: jest.fn(() => ({})),
  log: jest.fn(),
  recordError: jest.fn(),
  setUserId: jest.fn(async () => null),
}));

// The default app is registered by the native side at launch; here it is a
// name, which is all the modules above it ever pass along.
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));

// App Check is native attestation; the suite only needs the calls to exist
// and the header helper to answer. No test asserts on the token itself.
jest.mock('@react-native-firebase/app-check', () => ({
  __esModule: true,
  ReactNativeFirebaseAppCheckProvider: jest.fn().mockImplementation(() => ({
    configure: jest.fn(),
  })),
  initializeAppCheck: jest.fn(() => ({})),
  getToken: jest.fn(async () => ({ token: 'test-app-check-token' })),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  __esModule: true,
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'test-token'),
  onMessage: jest.fn(() => () => undefined),
  onTokenRefresh: jest.fn(() => () => undefined),
  setBackgroundMessageHandler: jest.fn(),
}));

// The gallery is a native screen: the suite only ever needs the shape of the
// answer, and each test that cares sets its own result.
jest.mock('react-native-image-picker', () => ({
  __esModule: true,
  launchImageLibrary: jest.fn(async () => ({ didCancel: true })),
}));

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').default.clear();
});
