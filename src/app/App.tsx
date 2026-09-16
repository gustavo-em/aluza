import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import styled, { ThemeProvider } from 'styled-components/native';

import { createEventBus } from '../shared/events/EventBus';
import type {
  TaskEvent,
  TaskEventBus,
} from '../features/tasks/domain/TaskEvent';
import { isCompleted, type Task } from '../features/tasks/domain/Task';
import { AuthGate } from '../features/auth/presentation/AuthGate';
import { getAuthCopy } from '../features/auth/presentation/localization/authCopy';
import { useAuthViewModel } from '../features/auth/presentation/view-models/useAuthViewModel';
import { firebaseAuthAdapter } from '../features/auth/infrastructure/firebase/firebaseAuthAdapter';
import { firestoreProfileAdapter } from '../features/auth/infrastructure/firebase/firestoreProfileAdapter';
import { imagePickerAvatarAdapter } from '../features/auth/infrastructure/firebase/imagePickerAvatarAdapter';
import { useProfileViewModel } from '../features/auth/presentation/view-models/useProfileViewModel';
import { ProfileScreen } from '../features/auth/presentation/screens/ProfileScreen';
import { AccountSection } from '../features/auth/presentation/views/AccountSection';
import { DeleteAccountDialog } from '../features/auth/presentation/views/DeleteAccountDialog';
import { useDeleteAccountViewModel } from '../features/auth/presentation/view-models/useDeleteAccountViewModel';
import type { AuthViewModel } from '../features/auth/presentation/view-models/useAuthViewModel';
import { systemClock } from '../features/tasks/infrastructure/clock/systemClock';
import { systemHaptics } from '../features/tasks/infrastructure/haptics/systemHaptics';
import { firestoreShareGateway } from '../features/tasks/infrastructure/sharing/firestoreShareGateway';
import { systemClipboard } from '../features/tasks/infrastructure/sharing/systemClipboard';
import { firebaseCaptureInterpreter } from '../features/tasks/infrastructure/capture/firebaseCaptureInterpreter';
import { firebaseVoiceCapture } from '../features/tasks/infrastructure/voice/firebaseVoiceCapture';
import { nitroVoiceRecorder } from '../features/tasks/infrastructure/voice/nitroVoiceRecorder';
import {
  clearLocalTaskData,
  createLocalTaskStores,
} from '../features/tasks/infrastructure/storage/asyncStorageStores';
import { firestoreWorkspaceBackup } from '../features/tasks/infrastructure/storage/firestoreWorkspaceBackup';
import { firebaseUsageReporter } from '../features/tasks/infrastructure/usage/firebaseUsageReporter';
import { deriveMemberIdentity } from '../features/tasks/presentation/models/memberIdentity';
import { FocusScreen } from '../features/tasks/presentation/screens/FocusScreen';
import { ListsScreen } from '../features/tasks/presentation/screens/ListsScreen';
import { ProgressScreen } from '../features/tasks/presentation/screens/ProgressScreen';
import { SettingsScreen } from '../features/tasks/presentation/screens/SettingsScreen';
import { TodayScreen } from '../features/tasks/presentation/screens/TodayScreen';
import { useFocusViewModel } from '../features/tasks/presentation/view-models/useFocusViewModel';
import { useProjectActivity } from '../features/tasks/presentation/view-models/useProjectActivity';
import { useTasksViewModel } from '../features/tasks/presentation/view-models/useTasksViewModel';
import { TabBar } from '../features/tasks/presentation/views/TabBar';
import {
  ListsGlyph,
  TodayGlyph,
  YouGlyph,
} from '../features/tasks/presentation/views/TabGlyphs';
import { FocusOverlay } from '../features/tasks/presentation/views/FocusOverlay';
import { TrioCelebration } from '../features/tasks/presentation/views/TrioCelebration';
import { SCREEN_ENTER } from './animation/motion';
import { AppSplash } from './components/AppSplash';
import {
  OnboardingScreen,
  type OnboardingOutcome,
} from './components/OnboardingScreen';
import { ReviewInvitation } from './components/ReviewInvitation';
import { APP_VERSION } from './config/appMetadata';
import { createBreadcrumbSubscriber } from './infrastructure/crash/createBreadcrumbSubscriber';
import { firebaseCrashReporter } from './infrastructure/crash/firebaseCrashReporter';
import { asyncStoragePreferencesStore } from './infrastructure/preferences/asyncStoragePreferencesStore';
import { asyncStorageReviewInvitationStore } from './infrastructure/review/asyncStorageReviewInvitationStore';
import { systemAppReviewPrompter } from './infrastructure/review/systemAppReviewPrompter';
import { youReselectAction } from './navigation/tabReselect';
import { playInstallReferrer } from '../features/tasks/infrastructure/install/playInstallReferrer';
import { useIncomingInvite } from './session/useIncomingInvite';
import { useReviewInvitation } from './session/useReviewInvitation';
import { useLocalWorkspace } from './session/useLocalWorkspace';
import { useWorkspaceBackup } from './session/useWorkspaceBackup';
import { getAppTheme } from './theme/theme';
import type { AppearanceMode } from './theme/theme';
import {
  useAppViewModel,
  type AppViewModel,
} from './view-models/useAppViewModel';

/**
 * The composition root.
 *
 * Every concrete adapter is built here and handed to the view models: this is
 * the only file in the app that knows AsyncStorage exists. Swapping storage
 * for a server, or the console reporter for a real analytics client, is a
 * change to these imports and to nothing else.
 */
function AppContent({
  app,
  auth,
  bus,
  incomingInviteToken,
  inviteIntent,
  joinIntent,
  onIncomingInviteHandled,
  onInviteIntentDone,
  onJoinIntentDone,
  onReady,
  onReplayOnboarding,
}: {
  app: AppViewModel;
  auth: AuthViewModel;
  bus: TaskEventBus;
  /** A token from a tapped invite link, held by the shell so it survives the
   * sign-in between the tap and this screen. */
  incomingInviteToken: string | null;
  onIncomingInviteHandled: () => void;
  /** Somebody asked to invite on the walk-through and has an account now: the
   * space and its invite are made here, without another question. */
  inviteIntent: boolean;
  onInviteIntentDone: () => void;
  /** Somebody said on the walk-through that they are holding an invite the app
   * never saw — the link was opened on a phone that had no app yet, and the
   * store carried nothing across. The sheet that takes a link opens itself as
   * soon as there is an account to join with. */
  joinIntent: boolean;
  onJoinIntentDone: () => void;
  onReady: () => void;
  /** Reopens the walk-through from settings. The shell owns it, because the
   * same screen also covers the signed-out side. */
  onReplayOnboarding: () => void;
}) {
  const profile = useProfileViewModel({
    profilePort: firestoreProfileAdapter,
    avatarPort: imagePickerAvatarAdapter,
    user: auth.user,
    fallbackName: app.copy.tabs.you,
  });
  // The Você tab has one place to go: the profile screen, pushed over it.
  const [youRoute, setYouRoute] = useState<'root' | 'profile'>('root');

  const identity = useMemo(
    () =>
      auth.user == null
        ? null
        : {
            personId: auth.user.uid,
            ...deriveMemberIdentity(
              profile.visibleProfile,
              auth.user.displayName,
              app.copy.tabs.you,
              auth.user.photoURL,
            ),
          },
    [auth.user, app.copy, profile.visibleProfile],
  );

  // Every key this account reads and writes carries its uid, so two accounts
  // on one phone keep two workspaces and neither has to be erased for the
  // other. The shell remounts this component on a new uid, so the stores are
  // rebuilt with it.
  const stores = useMemo(
    () => createLocalTaskStores(auth.user?.uid ?? 'anon'),
    [auth.user?.uid],
  );

  // The confirmation is a line in the account group, not a screen of its own:
  // it says the save landed and then gets out of the way.
  const { status: profileStatus, dismissSaved } = profile;

  useEffect(() => {
    if (profileStatus !== 'saved') return;

    // Only the status and the callback matter: depending on the whole view
    // model would restart the timer on every render of the shell.
    const timeout = setTimeout(dismissSaved, 2500);
    return () => clearTimeout(timeout);
  }, [dismissSaved, profileStatus]);

  const activity = useProjectActivity({
    enabled: app.projectActivityNotifications,
    language: app.language,
    personId: auth.user?.uid ?? null,
    onPermissionAsked: app.markActivityPermissionAsked,
    onEnabledChange: app.changeProjectActivityNotifications,
  });

  const tasks = useTasksViewModel({
    bus,
    clock: systemClock,
    haptics: systemHaptics,
    listStore: stores.listStore,
    progressStore: stores.progressStore,
    taskStore: stores.taskStore,
    trioStore: stores.trioStore,
    usageReporter: firebaseUsageReporter,
    shareGateway: firestoreShareGateway,
    groupStreakStore: stores.groupStreakStore,
    clipboard: systemClipboard,
    captureInterpreter: firebaseCaptureInterpreter,
    voiceRecorder: nitroVoiceRecorder,
    voiceCapture: firebaseVoiceCapture,
    identity,
    language: app.language,
    dayCapacity: app.dayCapacity,
    onRemoteProject: activity.onRemoteProject,
  });
  const focus = useFocusViewModel({ bus, clock: systemClock });
  // Counting closed tasks towards the one question the app ever asks about
  // itself. It listens to the same bus everything else does, so no screen has
  // to remember to report anything.
  const review = useReviewInvitation(bus, asyncStorageReviewInvitationStore);

  const [durationTask, setDurationTask] = useState<Task | null>(null);
  const [isFocusOpen, setIsFocusOpen] = useState(false);

  /**
   * Going from the list to a focus block.
   *
   * It lives here because it crosses two screens: the layer belongs to the
   * shell and the session belongs to the focus view model, so neither screen
   * can own it without reaching into the other. Nothing starts on this side —
   * the length is the first question on the other one.
   */
  const chooseFocusDurationFor = useCallback((task: Task) => {
    setDurationTask(task);
    setIsFocusOpen(true);
  }, []);

  const closeFocus = useCallback(() => {
    setIsFocusOpen(false);
    setDurationTask(null);
  }, []);

  const focusSession = focus.session;
  const focusedTask = tasks.tasks.find(
    entry => entry.id === focusSession?.taskId,
  );
  const hadSession = useRef(false);

  // A block that ends anywhere — the stop button, the complete button — sends
  // the person back to the list. Closing the layer never does the reverse.
  useEffect(() => {
    if (focusSession != null) {
      hadSession.current = true;
      return;
    }

    if (!hadSession.current) return;

    hadSession.current = false;
    setIsFocusOpen(false);
    setDurationTask(null);
  }, [focusSession]);

  // Ticking the box in the list is still the natural way to finish a task, so
  // it cannot leave a block running on something already done.
  useEffect(() => {
    if (focusSession == null || focusedTask == null) return;
    if (!isCompleted(focusedTask)) return;

    focus.stop();
  }, [focus, focusSession, focusedTask]);

  const focusRow = useMemo(
    () =>
      focusSession == null
        ? null
        : {
            taskId: focusSession.taskId,
            label: focus.label,
            phase: focusSession.phase,
            onOpen: () => setIsFocusOpen(true),
          },
    [focus.label, focusSession],
  );

  useEffect(() => {
    if (tasks.isRestored) onReady();
  }, [onReady, tasks.isRestored]);

  // The answer given before the account is honoured as soon as there is one:
  // the spaces tab is where the new space and its invite appear.
  const selectTab = app.selectTab;

  useEffect(() => {
    if (!inviteIntent || !tasks.isRestored) return;

    selectTab('lists');
  }, [inviteIntent, selectTab, tasks.isRestored]);

  // A link somebody says they have goes to the same tab: the sheet that takes
  // one lives there too.
  useEffect(() => {
    if (!joinIntent || !tasks.isRestored) return;

    selectTab('lists');
  }, [joinIntent, selectTab, tasks.isRestored]);

  // A tapped invite link goes to the same place, for the same reason: the
  // sheet that opens on it lives on the spaces tab.
  useEffect(() => {
    if (incomingInviteToken == null || !tasks.isRestored) return;

    selectTab('lists');
  }, [incomingInviteToken, selectTab, tasks.isRestored]);

  // Leaving the account leaves its data alone. Each account's keys carry its
  // own uid, so the next person to sign in on this phone reads their own set
  // and never this one — the wipe that used to run here was what made signing
  // back in open an empty app.
  const signOut = useCallback(async () => {
    await auth.signOut();
  }, [auth]);

  // Erasing the account, unlike leaving it, has to reach every project this
  // device knows about: the ones this account owns come down for everybody in
  // them, and the ones it only belongs to lose its row. Each is on its own —
  // a project that refuses is not a reason to keep an account somebody asked
  // to erase, and the ones after it still go.
  const detachSharedProjects = useCallback(async () => {
    const personId = auth.user?.uid;
    if (personId == null) return;

    await Promise.all(
      tasks.lists
        .filter(list => list.share != null)
        .map(async list => {
          const share = list.share;
          if (share == null) return;

          const owned = share.members.some(
            member => member.personId === personId && member.role === 'owner',
          );

          try {
            await (owned
              ? firestoreShareGateway.revokeLink(share)
              : firestoreShareGateway.leave(share, personId));
          } catch {
            // Nothing to report: the account is going either way, and this
            // row is not worth stopping it over.
          }
        }),
    );
  }, [auth.user?.uid, tasks.lists]);

  const clearLocalData = useCallback(async () => {
    const personId = auth.user?.uid;
    if (personId == null) return;

    await clearLocalTaskData(personId);
  }, [auth.user?.uid]);

  const deleteAccount = useDeleteAccountViewModel({
    authPort: firebaseAuthAdapter,
    profilePort: firestoreProfileAdapter,
    copy: getAuthCopy(app.language),
    uid: auth.user?.uid ?? null,
    handle: profile.profile?.handle ?? null,
    detachSharedProjects,
    clearLocalData,
  });

  const behindProfile = youRoute === 'profile';
  // Taking the column out of the layout is what removes it from the Android
  // accessibility tree, but doing it on the same frame would empty the window
  // while the profile screen is still sliding in from the right. The screen
  // arrives first; the tab goes out from under it.
  const [tabHidden, setTabHidden] = useState(false);

  useEffect(() => {
    if (!behindProfile) {
      setTabHidden(false);
      return;
    }

    const timeout = setTimeout(() => setTabHidden(true), SCREEN_ENTER.duration);
    return () => clearTimeout(timeout);
  }, [behindProfile]);

  const youScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  // Tapping the tab that is already open steps back one level. Here that is
  // the profile screen; with nothing pushed over the tab, the column goes back
  // to the top. Anything covering the app — a block, the celebration, the
  // rating card, the account dialog — is what the tap would be answering, so
  // it is left alone.
  const tabReselectCount = app.tabReselectCount;
  const lastTabReselect = useRef(tabReselectCount);
  const isShellOverlayOpen =
    isFocusOpen ||
    deleteAccount.isOpen ||
    tasks.celebratingStreak != null ||
    review.isInviting;

  useEffect(() => {
    if (tabReselectCount === lastTabReselect.current) return;

    lastTabReselect.current = tabReselectCount;
    if (app.activeTab !== 'you') return;

    const action = youReselectAction({
      blocked: isShellOverlayOpen,
      route: youRoute,
    });

    if (action === 'closeProfile') setYouRoute('root');
    if (action === 'scrollTop')
      youScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [app.activeTab, isShellOverlayOpen, tabReselectCount, youRoute]);

  return (
    <>
      {/* `accessibilityViewIsModal` is iOS only, and the Android flags on a
          wrapper still left the tab readable underneath. Taking the whole
          column out of the layout is what actually removes it from the tree —
          and `display: none` keeps every screen mounted, so coming back lands
          on the same scroll instead of replaying the tab. */}
      <View
        accessibilityElementsHidden={behindProfile}
        collapsable={false}
        importantForAccessibility={
          behindProfile ? 'no-hide-descendants' : 'auto'
        }
        style={tabHidden ? styles.beneathHidden : styles.beneath}
      >
        <Safe edges={['top']}>
          {app.activeTab === 'today' ? (
            <TodayScreen
              copy={app.copy}
              focus={focusRow}
              language={app.language}
              onChooseFocusDuration={chooseFocusDurationFor}
              onVoiceUsed={app.markVoiceCaptureUsed}
              tabReselect={tabReselectCount}
              viewModel={tasks}
              voiceUsed={app.voiceCaptureUsed}
            />
          ) : null}

          {app.activeTab === 'lists' ? (
            <ListsScreen
              autoInvite={inviteIntent}
              autoJoin={joinIntent}
              copy={app.copy}
              incomingInviteToken={incomingInviteToken}
              language={app.language}
              onAutoInviteDone={onInviteIntentDone}
              onAutoJoinDone={onJoinIntentDone}
              focusRunning={focusRow != null}
              onChooseFocusDuration={chooseFocusDurationFor}
              onIncomingInviteHandled={onIncomingInviteHandled}
              onVoiceUsed={app.markVoiceCaptureUsed}
              notificationPrompt={{
                // The ask happens where the news comes from, and only for
                // someone who actually shares a project.
                visible:
                  app.projectActivityNotifications &&
                  !app.hasAskedActivityPermission,
                onEnable: activity.enableNotifications,
                onDismiss: app.markActivityPermissionAsked,
              }}
              ownProfile={profile.profile}
              tabReselect={tabReselectCount}
              viewModel={tasks}
              voiceUsed={app.voiceCaptureUsed}
            />
          ) : null}

          {app.activeTab === 'you' ? (
            <YouTab
              contentContainerStyle={styles.youTab}
              ref={youScrollRef}
              showsVerticalScrollIndicator={false}
            >
              {/* Who this account is comes first: the numbers and the settings
                are what follows it. */}
              <AccountSection
                copy={getAuthCopy(app.language)}
                isAnonymous={auth.user?.isAnonymous ?? false}
                onEditProfile={() => setYouRoute('profile')}
                personId={auth.user?.uid ?? null}
                profile={profile.profile}
                profileSaved={profileStatus === 'saved'}
                tabLabel={app.copy.tabs.you}
              />
              <ProgressScreen copy={app.copy} viewModel={tasks} />
              <SettingsScreen
                accountCopy={getAuthCopy(app.language)}
                appearanceMode={app.appearanceMode}
                copy={app.copy}
                dayCapacity={app.dayCapacity}
                languageChoice={app.languageChoice}
                onAppearanceModeChange={app.changeAppearanceMode}
                onDayCapacityChange={app.changeDayCapacity}
                onLanguageChange={app.changeLanguage}
                onDeleteAccount={deleteAccount.open}
                onReplayOnboarding={onReplayOnboarding}
                onSignOut={signOut}
                isAnonymous={auth.user?.isAnonymous ?? false}
                personId={auth.user?.uid ?? null}
                projectActivityNotifications={app.projectActivityNotifications}
                projectActivityBlocked={activity.isAllowed === false}
                onProjectActivityNotificationsChange={activity.setEnabled}
                onOpenNotificationSettings={activity.openSystemSettings}
                version={APP_VERSION}
              />
            </YouTab>
          ) : null}
        </Safe>

        <BottomSafe edges={['bottom']}>
          <TabBar
            active={app.activeTab}
            items={[
              { id: 'today', label: app.copy.tabs.today, Glyph: TodayGlyph },
              { id: 'lists', label: app.copy.tabs.lists, Glyph: ListsGlyph },
              { id: 'you', label: app.copy.tabs.you, Glyph: YouGlyph },
            ]}
            onSelect={app.selectTab}
          />
        </BottomSafe>
      </View>

      {/* The session covers the list and the tab bar whole: a block is not one
          destination among others, it is the only thing on screen while it is
          open. */}
      {isFocusOpen ? (
        <FocusOverlay
          label={app.copy.focus.close}
          onClose={closeFocus}
          onSessionGround={focusSession != null}
        >
          <FocusScreen
            copy={app.copy}
            focus={focus}
            openDurationFor={durationTask}
            viewModel={tasks}
          />
        </FocusOverlay>
      ) : null}

      {tasks.celebratingStreak == null ? null : (
        <TrioCelebration
          copy={app.copy}
          onClose={tasks.dismissCelebration}
          streakDays={tasks.celebratingStreak}
        />
      )}

      {/* Never on top of the celebration: the third task of a day is both the
          moment the trio closes and the moment this is due, and two cards over
          each other would make the good news the thing in the way. The flag
          stays raised, so the question arrives once the celebration is out. */}
      {review.isInviting && tasks.celebratingStreak == null ? (
        <ReviewInvitation
          copy={app.copy}
          onDismiss={review.dismiss}
          onNever={review.decline}
          onRate={() => {
            review.accept();
            systemAppReviewPrompter
              .requestReview()
              .catch(() => undefined)
              .finally(review.dismiss);
          }}
        />
      ) : null}

      {/* The profile is a screen of its own, over the tab bar: naming yourself
          is typing, and typing needs the whole window. */}
      {youRoute === 'profile' && auth.user != null ? (
        <ProfileScreen
          copy={getAuthCopy(app.language)}
          errorKind={profile.errorKind}
          fallbackName={app.copy.tabs.you}
          onBack={() => setYouRoute('root')}
          onChangeAvatar={profile.changeAvatar}
          onRemoveAvatar={profile.removeAvatar}
          onSubmit={profile.save}
          personId={auth.user.uid}
          profile={profile.profile}
          avatarBusy={profile.avatarStatus === 'working'}
          avatarErrorKind={profile.avatarErrorKind}
          saving={profileStatus === 'saving'}
        />
      ) : null}

      {/* Last of all, over everything including the profile: whatever is
          underneath is about to stop existing. */}
      {deleteAccount.isOpen ? (
        <DeleteAccountDialog
          asksForPassword={deleteAccount.asksForPassword}
          busy={deleteAccount.isDeleting}
          copy={getAuthCopy(app.language)}
          error={deleteAccount.error}
          needsProof={deleteAccount.needsProof}
          onCancel={deleteAccount.cancel}
          onConfirm={deleteAccount.confirm}
        />
      ) : null}
    </>
  );
}

function AppShell({
  app,
  auth,
  appearanceMode,
  bus,
}: {
  app: AppViewModel;
  auth: AuthViewModel;
  appearanceMode: AppearanceMode;
  bus: TaskEventBus;
}) {
  const [isContentReady, setIsContentReady] = useState(false);
  const [isOpening, setIsOpening] = useState(true);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const [isReplayingOnboarding, setIsReplayingOnboarding] = useState(false);
  // Held in memory only: an app that dies before the account is created opens
  // the normal way next time, with no half-finished invite waiting.
  const [inviteIntent, setInviteIntent] = useState(false);
  const [joinIntent, setJoinIntent] = useState(false);
  const handleContentReady = useCallback(() => setIsContentReady(true), []);
  const replayOnboarding = useCallback(
    () => setIsReplayingOnboarding(true),
    [],
  );

  // A saved session should open straight into the app, but "checking" can
  // never be allowed to hold the splash open forever — if the native auth
  // bridge has not answered within a few seconds, fall forward to the safe
  // default (the login screen) rather than freeze on the launch mark.
  useEffect(() => {
    if (auth.status !== 'checking') return;

    const timeout = setTimeout(() => setAuthTimedOut(true), 6000);
    return () => clearTimeout(timeout);
  }, [auth.status]);

  const authStatus =
    auth.status === 'checking' && authTimedOut ? 'signedOut' : auth.status;
  const personId = auth.user?.uid ?? null;

  // Telemetry follows the account, not the device: the same person on a second
  // phone is one person, and a crash that hits ten people once is a different
  // problem from one that hits one person ten times.
  useEffect(() => {
    firebaseCrashReporter.identify(personId);
    firebaseUsageReporter.identify(personId).catch(() => undefined);
  }, [personId]);

  // What a crash report is read against. It is subscribed here rather than
  // inside a feature because the trail has to outlive any one screen.
  useEffect(
    () => createBreadcrumbSubscriber(bus, firebaseCrashReporter),
    [bus],
  );
  // Nothing of this account may be drawn before this answers: the walk from
  // the pre-namespace keys, and the restore from the server backup when this
  // device has nothing of its own, both happen behind it.
  // Um convite tocado fora do app. Fica aqui, no shell, porque entre o toque e
  // a tela que sabe o que fazer com ele há um login inteiro — e quem entra por
  // convite normalmente ainda não tem conta.
  const incomingInvite = useIncomingInvite({
    referrer: playInstallReferrer,
    // Once, and only once it can be remembered: Play keeps the referrer
    // readable for the life of the install, so re-reading it every launch
    // would reopen the same invite forever.
    ready: app.isRestored && !app.installReferrerRead,
    onRead: app.markInstallReferrerRead,
  });
  const workspaceStatus = useLocalWorkspace(
    authStatus === 'signedIn' ? personId : null,
    firestoreWorkspaceBackup,
  );

  useWorkspaceBackup(
    authStatus === 'signedIn' ? personId : null,
    firestoreWorkspaceBackup,
    bus,
  );
  const isAuthResolved = authStatus !== 'checking';
  const isShellReady = app.isRestored && isAuthResolved;
  // The walk-through comes before the account: on a clean device it covers the
  // sign-in screen, and it only comes back when settings ask for it. A restored
  // session still gets it once — the flag lives on this device, so a keychain
  // session with no local preferences is also a first opening.
  const isShowingOnboarding =
    isShellReady && (isReplayingOnboarding || !app.hasSeenOnboarding);

  // Both answers close the walk-through for good: the step is not a question
  // anybody has to answer twice. Only the invite leaves something to do after.
  const finishOnboarding = (outcome: OnboardingOutcome) => {
    setIsReplayingOnboarding(false);
    // Reported straight from the shell, not through the bus: on a clean
    // device the walk-through closes before there is an account, and the
    // subscriber that carries telemetry only exists once one is signed in.
    firebaseUsageReporter
      .onboardingFinished({ outcome })
      .catch(() => undefined);
    if (!app.hasSeenOnboarding) app.finishOnboarding();
    // Only the invite leaves something to do. `join` leaves nothing: the
    // token is already held, and the space it opens is somebody else's —
    // making one here would be the second space nobody asked for.
    if (outcome === 'invite') setInviteIntent(true);
    // `hasInvite` leaves the opposite of `invite` to do: no space is made, and
    // the sheet that takes a link opens once there is an account.
    if (outcome === 'hasInvite') setJoinIntent(true);
  };

  const clearInviteIntent = useCallback(() => setInviteIntent(false), []);
  const clearJoinIntent = useCallback(() => setJoinIntent(false), []);

  return (
    <Root>
      <StatusBar
        barStyle={appearanceMode === 'dark' ? 'light-content' : 'dark-content'}
      />

      {/* While the walk-through covers the app, what is under it is out of the
          accessibility tree as well. The flags alone still left the tabs and
          the settings buttons in the node dump, so the layer is also taken out
          of layout with `display: none` — the screens stay mounted, so nothing
          is lost when the walk-through closes. */}
      <View
        accessibilityElementsHidden={isShowingOnboarding}
        importantForAccessibility={
          isShowingOnboarding ? 'no-hide-descendants' : 'auto'
        }
        pointerEvents={isShowingOnboarding ? 'none' : 'auto'}
        style={isShowingOnboarding ? styles.beneathHidden : styles.beneath}
      >
        {isShellReady &&
        authStatus === 'signedIn' &&
        workspaceStatus === 'ready' ? (
          <AppContent
            app={app}
            auth={auth}
            bus={bus}
            incomingInviteToken={incomingInvite.token}
            inviteIntent={inviteIntent}
            joinIntent={joinIntent}
            /* One account, one mount: remounting on the uid drops the previous
               session's tasks from memory, not only from storage. */
            key={personId ?? 'anon'}
            onIncomingInviteHandled={incomingInvite.clear}
            onInviteIntentDone={clearInviteIntent}
            onJoinIntentDone={clearJoinIntent}
            onReady={handleContentReady}
            onReplayOnboarding={replayOnboarding}
          />
        ) : null}

        {isShellReady && authStatus === 'signedOut' ? (
          <AuthGate
            auth={auth}
            copy={getAuthCopy(app.language)}
            /* The entrance shows the same space the walk-through does, so the
               words inside its cut-out come from the one dictionary. */
            demo={app.copy.onboarding.demo}
            /* Um convite tocado antes da conta: a entrada mostra o que é,
               e o token segue guardado até a tela de espaços consumi-lo. */
            inviteToken={incomingInvite.token}
            onReady={handleContentReady}
          />
        ) : null}
      </View>

      {isShowingOnboarding ? (
        <OnboardingScreen
          copy={app.copy}
          invited={incomingInvite.token != null}
          onFinish={finishOnboarding}
        />
      ) : null}

      {isOpening ? (
        <AppSplash
          isReady={isShellReady && isContentReady}
          language={app.language}
          onFinished={() => setIsOpening(false)}
        />
      ) : null}
    </Root>
  );
}

export default function App() {
  const bus = useMemo(
    () =>
      createEventBus<TaskEvent>({
        // A listener that throws is swallowed by the bus so it cannot take the
        // save or the animation down with it — which also means nobody would
        // ever hear about it. This is where it gets heard.
        onListenerError: (error, type) => {
          firebaseCrashReporter.recordError(error, `event:${type}`);

          if (__DEV__)
            console.warn(`[events] listener failed for ${type}`, error);
        },
      }),
    [],
  );
  // The shell's state is created once, here, and handed down: two calls to the
  // same hook would be two independent apps disagreeing about the theme.
  const app = useAppViewModel(asyncStoragePreferencesStore, bus);
  // The only place that knows Firebase exists, matching the storage adapters
  // above: everything downstream depends on AuthPort, never on the SDK.
  const auth = useAuthViewModel(firebaseAuthAdapter);
  // The app opens light, always: the phone's own theme is not a preference
  // anybody set here, and following it made a clean install open dark before
  // the stored choice came back.
  const openingAppearance: AppearanceMode = app.isRestored
    ? app.appearanceMode
    : 'light';

  return (
    <ThemeProvider theme={getAppTheme(openingAppearance)}>
      <SafeAreaProvider>
        <AppShell
          app={app}
          auth={auth}
          appearanceMode={openingAppearance}
          bus={bus}
        />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const Root = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Safe = styled(SafeAreaView)`
  flex: 1;
`;

const BottomSafe = styled(SafeAreaView)`
  background-color: ${({ theme }) => theme.colors.background};
`;

/* One scroll for the whole tab: the rhythm block and the settings group share a
   single column, so neither can be clipped by the other. */
const YouTab = styled.ScrollView`
  flex: 1;
`;

const styles = StyleSheet.create({
  youTab: { paddingBottom: 24 },
  /* Everything the walk-through can cover, in one plain node: the flags that
     take it out of the accessibility tree go straight on the native view. */
  beneath: { flex: 1 },
  beneathHidden: { flex: 1, display: 'none' },
});
