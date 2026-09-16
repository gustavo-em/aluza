import { useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import {
  buttonTextAttrs,
  buttonTextMetrics,
} from '../../../../app/theme/buttonText';

import type { ShareErrorKind } from '../../domain/ShareError';
import {
  buildInviteLink,
  canEdit,
  type ListRole,
  type TaskList,
} from '../../domain/TaskList';
import {
  rowEnter,
  scrimEnter,
  scrimExit,
} from '../../../../app/animation/motion';
import {
  sheetAnchor,
  useSheetRise,
} from '../../../../app/animation/useSheetRise';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { ConfirmDialog } from './ConfirmDialog';
import { CheckGlyph, ProjectGlyph } from './FieldGlyphs';
import { joinHistory } from '../models/joinHistory';
import { memberDisplayName } from '../models/memberIdentity';
import { projectTone } from '../models/projectAppearance';
import { MemberChip } from './MemberChip';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetActionsSpacer,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';
import { PanelBox, PanelHead, PanelTitle } from './SheetPanel';

type ShareStatus = 'idle' | 'loading' | 'error';

interface ShareSheetProps {
  copy: TaskCopy;
  /** Which language the dates in the history are written in. */
  language: AppLanguage;
  list: TaskList;
  personId: string;
  /** How the signed-in account names itself right now. Their own row reads
   * from this, never from what the project recorded before the profile
   * existed. */
  identity: {
    personId: string;
    name: string;
    handle: string | null;
  } | null;
  status: ShareStatus;
  errorKind: ShareErrorKind | null;
  /** Opened by the space being made: the sheet is the last step of creating
   * it, so it says the space is ready and offers the invite — members and
   * roles wait for the menu of the space itself. Leaving undoes nothing. */
  justCreated?: boolean;
  onCancel: () => void;
  onCreateLink: (invitedAs: Exclude<ListRole, 'owner'>) => void;
  onChangeInvitedAs: (invitedAs: Exclude<ListRole, 'owner'>) => void;
  /** The role goes out with the token: what the message tells the other
   * person they will be able to do has to be the role the link carries, not
   * the one the sheet had when it opened. */
  onCopyLink: (token: string, invitedAs: Exclude<ListRole, 'owner'>) => void;
  onInvite: (token: string, invitedAs: Exclude<ListRole, 'owner'>) => void;
  onRemoveMember: (personId: string) => void;
  onStopSharing: () => void;
}

/**
 * Turning a project into a group, and reading who is in it.
 *
 * Same shell as `ProjectEditorSheet`: only the middle changes. The link is
 * revealed only after it exists — before that, the one thing on the sheet is
 * the button that creates it.
 */
export function ShareSheet({
  copy,
  language,
  list,
  personId,
  identity,
  status,
  errorKind,
  justCreated = false,
  onCancel,
  onCreateLink,
  onChangeInvitedAs,
  onCopyLink,
  onInvite,
  onRemoveMember,
  onStopSharing,
}: ShareSheetProps) {
  const theme = useTheme();
  const traceOpen = useSheetOpenTrace('ShareSheet');
  // The floor comes from the safe area, not from a guessed margin: the sheet
  // has to end under the gesture bar on both platforms, and on the iPhone a
  // fixed overhang left the two buttons cut off below the screen.
  const insets = useContext(SafeAreaInsetsContext);
  const rise = useSheetRise();
  const [invitedAs, setInvitedAs] = useState<Exclude<ListRole, 'owner'>>(
    list.share?.invitedAs ?? 'editor',
  );
  const [justCopied, setJustCopied] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState<{
    personId: string;
    name: string;
  } | null>(null);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const lastAction = useRef<() => void>(() => onCreateLink(invitedAs));
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const viewer = list.share != null && !canEdit(list, personId);
  const members = list.share?.members ?? [];
  // Managing the invite (role, members, stopping the share) is the owner's
  // job; an editor edits tasks but does not run the group.
  const isOwner =
    list.share == null ||
    members.find(member => member.personId === personId)?.role === 'owner';
  // Who came in and when: reading only, the same for everybody in the
  // project, and nothing at all on a project nobody else is in.
  const history = joinHistory(members, language);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCancel();
        return true;
      },
    );

    return () => subscription.remove();
  }, [onCancel]);

  useEffect(
    () => () => {
      if (copiedTimer.current != null) clearTimeout(copiedTimer.current);
    },
    [],
  );

  function handleCreateLink() {
    lastAction.current = () => onCreateLink(invitedAs);
    onCreateLink(invitedAs);
  }

  function handleCopy() {
    if (list.share == null) return;

    onCopyLink(list.share.token, list.share.invitedAs);
    setJustCopied(true);
    if (copiedTimer.current != null) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setJustCopied(false), 1200);
  }

  function handleChangeInvitedAs(next: Exclude<ListRole, 'owner'>) {
    setInvitedAs(next);
    if (list.share != null) onChangeInvitedAs(next);
  }

  // A refusal is not a connection problem: saying "check the internet" when
  // the server said no sends the person to fix the wrong thing.
  const errorMessage =
    errorKind === 'network'
      ? copy.lists.noNetwork
      : errorKind === 'invalid-invite'
      ? copy.lists.invalidInvite
      : errorKind === 'forbidden' || errorKind === 'unknown'
      ? copy.lists.shareRefused
      : null;

  // A link the server has not taken is not a link yet: while the last attempt
  // is refused, it stays on screen as unfinished work instead of as something
  // ready to send to somebody.
  const notPublished =
    list.share != null &&
    (errorKind === 'network' ||
      errorKind === 'forbidden' ||
      errorKind === 'unknown');

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible
    >
      <Overlay>
        <Scrim entering={scrimEnter()} exiting={scrimExit()}>
          <ScrimTouch
            accessibilityLabel={copy.capture.cancel}
            accessibilityRole="button"
            onPress={onCancel}
          />
        </Scrim>
        <Sheet
          onLayout={traceOpen}
          style={[
            rise,
            { paddingBottom: theme.spacing.large + (insets?.bottom ?? 0) },
          ]}
          testID="share-sheet"
        >
          <Grabber />
          {/* Everything above the buttons scrolls: a space with many people
              and a long history no longer pushes the way out off the phone. */}
          <Body
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {justCreated ? (
              <ReadyHead>
                <Badge $tone={projectTone(theme, list.color)}>
                  <ProjectGlyph
                    color={
                      list.color === 'sun'
                        ? theme.colors.onAccent
                        : theme.colors.card
                    }
                    icon={list.icon}
                    size={20}
                  />
                </Badge>
                <ReadyTexts>
                  <ReadyTitle accessibilityRole="header">
                    {copy.lists.readyTitle(list.name)}
                  </ReadyTitle>
                  <ReadySubtitle>{copy.lists.readySubtitle}</ReadySubtitle>
                </ReadyTexts>
              </ReadyHead>
            ) : (
              <>
                <Title accessibilityRole="header">
                  {`${copy.lists.share} ${list.name}`}
                </Title>
                <Hint>{copy.lists.shareHint}</Hint>
              </>
            )}

            {list.share == null && justCreated ? (
              /* The link was asked for the moment the space was made: the box
               is already there, waiting for it. */
              <PanelBox testID="share-link-box">
                <PanelHead>
                  <PanelTitle>{copy.lists.inviteLinkLabel}</PanelTitle>
                </PanelHead>
                <LinkLine>
                  <LinkText $pending>
                    {status === 'loading'
                      ? copy.lists.creatingLink
                      : copy.lists.linkNotPublished}
                  </LinkText>
                </LinkLine>
              </PanelBox>
            ) : list.share == null ? (
              <SheetPrimaryButton
                block
                disabled={status === 'loading'}
                label={
                  status === 'loading'
                    ? copy.lists.creatingLink
                    : copy.lists.createLink
                }
                onPress={handleCreateLink}
                testID="share-create-link"
              />
            ) : (
              <>
                <PanelBox testID="share-link-box">
                  <PanelHead>
                    <PanelTitle>{copy.lists.inviteLinkLabel}</PanelTitle>
                  </PanelHead>
                  <LinkLine accessibilityRole="text">
                    <LinkText $pending={notPublished}>
                      {buildInviteLink(list.share.token)}
                    </LinkText>
                    <CopyButton
                      accessibilityLabel={copy.lists.copyLinkAccessible}
                      accessibilityState={{ disabled: notPublished }}
                      disabled={notPublished}
                      hitSlop={8}
                      onPress={handleCopy}
                      testID="share-copy-link"
                    >
                      <CopyText $pending={notPublished}>
                        {justCopied
                          ? copy.lists.linkCopied
                          : copy.lists.copyLink}
                      </CopyText>
                    </CopyButton>
                  </LinkLine>
                  {notPublished ? (
                    <LinkNote testID="share-link-pending">
                      {copy.lists.linkNotPublished}
                    </LinkNote>
                  ) : (
                    <LinkNote>
                      {copy.lists.inviteLinkNote(
                        list.share.invitedAs === 'editor',
                      )}
                    </LinkNote>
                  )}
                </PanelBox>

                {!isOwner || justCreated ? null : (
                  <>
                    <SectionLabel>{copy.lists.invitedAsLabel}</SectionLabel>
                    <RoleRow>
                      <RoleButton
                        $selected={invitedAs === 'viewer'}
                        accessibilityLabel={copy.lists.roleViewer}
                        accessibilityRole="radio"
                        accessibilityState={{
                          selected: invitedAs === 'viewer',
                        }}
                        onPress={() => handleChangeInvitedAs('viewer')}
                      >
                        <RoleContent>
                          {invitedAs === 'viewer' ? (
                            <RoleCheck>
                              <CheckGlyph
                                color={theme.colors.onSelected}
                                size={14}
                              />
                            </RoleCheck>
                          ) : null}
                          <RoleButtonText
                            $selected={invitedAs === 'viewer'}
                            numberOfLines={1}
                          >
                            {copy.lists.roleViewer}
                          </RoleButtonText>
                        </RoleContent>
                      </RoleButton>
                      <RoleButton
                        $selected={invitedAs === 'editor'}
                        accessibilityLabel={copy.lists.roleEditor}
                        accessibilityRole="radio"
                        accessibilityState={{
                          selected: invitedAs === 'editor',
                        }}
                        onPress={() => handleChangeInvitedAs('editor')}
                      >
                        <RoleContent>
                          {invitedAs === 'editor' ? (
                            <RoleCheck>
                              <CheckGlyph
                                color={theme.colors.onSelected}
                                size={14}
                              />
                            </RoleCheck>
                          ) : null}
                          <RoleButtonText
                            $selected={invitedAs === 'editor'}
                            numberOfLines={1}
                          >
                            {copy.lists.roleEditor}
                          </RoleButtonText>
                        </RoleContent>
                      </RoleButton>
                    </RoleRow>
                    <Note>{copy.lists.roleChangeNote}</Note>
                  </>
                )}

                {justCreated ? null : (
                  <SectionLabel>{`${copy.lists.membersHeader.toUpperCase()} · ${
                    members.length
                  }`}</SectionLabel>
                )}
                {(justCreated ? [] : members).map((member, index) => {
                  // The logged-in person is "Você" in their own list of
                  // members; everybody else is the name and handle they chose.
                  // The session's own uid, however the row got here: an entry
                  // recorded before the profile existed is still this person.
                  const isMe =
                    member.personId === personId ||
                    member.personId === identity?.personId;
                  const displayName = isMe
                    ? copy.lists.memberYou
                    : memberDisplayName(member, copy.lists.memberSomeone);
                  const handle = isMe
                    ? identity?.handle ?? null
                    : member.handle;

                  return (
                    <MemberRow
                      entering={rowEnter(index)}
                      key={member.personId}
                      $last={index === members.length - 1}
                    >
                      <MemberChip
                        initials={
                          isMe ? copy.lists.memberYouInitials : undefined
                        }
                        name={displayName}
                        personId={member.personId}
                        pending={!member.joined}
                        photoURL={member.photoURL ?? null}
                        size="large"
                      />
                      <MemberInfo>
                        <MemberName numberOfLines={1} ellipsizeMode="tail">
                          {displayName}
                        </MemberName>
                        {isMe && identity != null ? (
                          <MemberSub numberOfLines={1} ellipsizeMode="tail">
                            {handle == null
                              ? identity.name
                              : `${identity.name} · @${handle}`}
                          </MemberSub>
                        ) : handle == null ? null : (
                          <MemberSub numberOfLines={1} ellipsizeMode="tail">
                            {`@${handle}`}
                          </MemberSub>
                        )}
                        {member.joined ? null : (
                          <MemberSub>{copy.lists.pendingInvite}</MemberSub>
                        )}
                      </MemberInfo>
                      {member.role === 'owner' ? (
                        <RoleTag>{copy.lists.roleOwner}</RoleTag>
                      ) : (
                        <RoleTag>
                          {member.role === 'editor'
                            ? copy.lists.roleEditor
                            : copy.lists.roleViewer}
                        </RoleTag>
                      )}
                      {isOwner && !isMe ? (
                        <RemoveButton
                          accessibilityLabel={copy.lists.removeMember(
                            displayName,
                          )}
                          hitSlop={14}
                          onPress={() =>
                            setConfirmingRemove({
                              personId: member.personId,
                              name: displayName,
                            })
                          }
                        >
                          <RemoveText>
                            {copy.lists.removeMemberLabel}
                          </RemoveText>
                        </RemoveButton>
                      ) : null}
                    </MemberRow>
                  );
                })}

                {history.entries.length === 0 || justCreated ? null : (
                  <>
                    <SectionHeader testID="share-join-history">
                      <SectionLabel>{`${copy.lists.joinHistoryHeader.toUpperCase()} · ${
                        history.total
                      }`}</SectionLabel>
                      <SectionRule />
                    </SectionHeader>
                    {history.entries.map((entry, index) => {
                      const isMe =
                        entry.member.personId === personId ||
                        entry.member.personId === identity?.personId;
                      const displayName = isMe
                        ? copy.lists.memberYou
                        : memberDisplayName(
                            entry.member,
                            copy.lists.memberSomeone,
                          );

                      return (
                        <HistoryRow
                          // Grouped into one node on purpose: read apart, the
                          // row would end on a bare dash instead of saying
                          // there is no date for this person.
                          accessible
                          accessibilityLabel={
                            entry.when == null
                              ? copy.lists.joinedAtUnknownAccessible(
                                  displayName,
                                )
                              : copy.lists.joinedAtAccessible(
                                  displayName,
                                  entry.when,
                                )
                          }
                          accessibilityRole="text"
                          entering={rowEnter(index)}
                          key={entry.member.personId}
                          $last={index === history.entries.length - 1}
                        >
                          <MemberChip
                            initials={
                              isMe ? copy.lists.memberYouInitials : undefined
                            }
                            name={displayName}
                            personId={entry.member.personId}
                            photoURL={entry.member.photoURL ?? null}
                          />
                          <HistoryName numberOfLines={1} ellipsizeMode="tail">
                            {displayName}
                          </HistoryName>
                          <HistoryWhen>
                            {entry.when ?? copy.lists.joinedAtUnknown}
                          </HistoryWhen>
                        </HistoryRow>
                      );
                    })}
                    {history.truncated ? (
                      <Note>
                        {copy.lists.joinHistoryTruncated(
                          history.entries.length,
                          history.total,
                        )}
                      </Note>
                    ) : null}
                  </>
                )}
              </>
            )}
          </Body>

          {errorMessage == null ? null : (
            <ErrorBanner>
              <ErrorText>{errorMessage}</ErrorText>
              <RetryButton
                accessibilityLabel={copy.lists.tryAgain}
                hitSlop={12}
                onPress={() => lastAction.current()}
              >
                <RetryText>{copy.lists.tryAgain}</RetryText>
              </RetryButton>
            </ErrorBanner>
          )}

          {justCreated ? (
            /* Leaving here undoes nothing — the space exists and so does the
               link — so the quiet button says "not now", never "cancel". */
            <SheetActionsRow>
              <SheetPrimaryButton
                disabled={list.share == null || notPublished}
                grow
                label={copy.lists.invite}
                onPress={() => {
                  if (list.share != null)
                    onInvite(list.share.token, list.share.invitedAs);
                }}
                testID="share-invite"
              />
              <SheetCancelButton label={copy.lists.notNow} onPress={onCancel} />
            </SheetActionsRow>
          ) : (
            <>
              {/* Its own line, on purpose. In the actions row the three
                  Portuguese labels did not fit, and the only control allowed
                  to shrink was Cancel — so it collapsed to "C.", a button
                  that says nothing. A destructive word also reads better
                  apart from the pair it is not part of. */}
              {isOwner && list.share != null ? (
                <StopRow>
                  <StopLink
                    accessibilityLabel={copy.lists.stopSharing}
                    onPress={() => setConfirmingStop(true)}
                  >
                    <StopLinkText>{copy.lists.stopSharing}</StopLinkText>
                  </StopLink>
                </StopRow>
              ) : null}
              <SheetActionsRow>
                <SheetActionsSpacer />
                <SheetCancelButton
                  label={copy.capture.cancel}
                  onPress={onCancel}
                />
                {viewer || list.share == null ? null : (
                  <SheetPrimaryButton
                    label={copy.lists.invite}
                    onPress={() =>
                      onInvite(list.share!.token, list.share!.invitedAs)
                    }
                    testID="share-invite"
                  />
                )}
              </SheetActionsRow>
            </>
          )}
        </Sheet>
      </Overlay>

      {confirmingRemove == null ? null : (
        <ConfirmDialog
          cancelLabel={copy.today.removeCancel}
          confirmLabel={copy.today.remove}
          destructive
          onCancel={() => setConfirmingRemove(null)}
          onConfirm={() => {
            lastAction.current = () =>
              onRemoveMember(confirmingRemove.personId);
            onRemoveMember(confirmingRemove.personId);
            setConfirmingRemove(null);
          }}
          testID="share-remove-member-confirm"
          title={copy.lists.removeMemberConfirm(confirmingRemove.name)}
        />
      )}

      {!confirmingStop ? null : (
        <ConfirmDialog
          body={copy.lists.stopSharingConfirm}
          cancelLabel={copy.today.removeCancel}
          confirmLabel={copy.lists.stopSharing}
          destructive
          onCancel={() => setConfirmingStop(false)}
          onConfirm={() => {
            lastAction.current = () => onStopSharing();
            onStopSharing();
            setConfirmingStop(false);
          }}
          testID="share-stop-sharing-confirm"
          title={copy.lists.stopSharing}
        />
      )}
    </Modal>
  );
}

const Overlay = styled.View`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  justify-content: flex-end;
  z-index: 35;
`;

const Scrim = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  background-color: ${({ theme }) => theme.colors.scrim};
`;

const ScrimTouch = styled.Pressable`
  flex: 1;
`;

/* The same white sheet the space is named on: this is its last step, not
   another object. The floor is set inline, from the safe area. */
const Sheet = styled(Animated.View)`
  ${sheetAnchor}
  background-color: ${({ theme }) => theme.colors.card};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
  max-height: 91%;
  padding: 12px ${({ theme }) => theme.spacing.medium + 4}px 0px;
`;

const Body = styled(ScrollView)`
  flex-grow: 0;
`;

const Grabber = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.border};
  align-self: center;
  margin-bottom: ${({ theme }) => theme.spacing.medium}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.heading}px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

/* The space's own square beside the word that it is ready. */
const ReadyHead = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
`;

const Badge = styled.View<{ $tone: string }>`
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background-color: ${({ $tone }) => $tone};
`;

const ReadyTexts = styled.View`
  flex: 1;
`;

const ReadyTitle = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.heading}px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;

const ReadySubtitle = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
  margin-top: 2px;
`;

const LinkLine = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 2}px;
`;

/* Waiting on the server, the link loses its ink: quiet, never an alarm
   colour. A link is typed out and pasted, so it is set in a typewriter face. */
const LinkText = styled.Text.attrs({ numberOfLines: 1 })<{ $pending: boolean }>`
  flex: 1;
  color: ${({ theme, $pending }) =>
    $pending ? theme.colors.muted : theme.colors.text};
  font-family: ${Platform.OS === 'ios' ? 'Menlo' : 'monospace'};
  font-size: 14px;
`;

/* A white pill on the panel's paper: the one thing in the box to press. */
const CopyButton = styled(PressableScale)`
  height: 32px;
  padding: 0px 12px;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.card};
`;

const CopyText = styled.Text<{ $pending: boolean }>`
  color: ${({ theme, $pending }) =>
    $pending ? theme.colors.muted : theme.colors.text};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 700;
`;

const LinkNote = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 500;
  line-height: ${({ theme }) => theme.type.caption + 6}px;
`;

const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

/* The section is held together by its label and the rule that runs out of it:
   no box, no fill, no radius of its own. */
const SectionHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const SectionRule = styled.View`
  flex: 1;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.borderSubtle};
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const HistoryRow = styled(Animated.View)<{ $last: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 4}px;
  min-height: 44px;
  padding: ${({ theme }) => theme.spacing.small}px 0px;
  border-bottom-width: ${({ $last }) => ($last ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
`;

const HistoryName = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 700;
`;

const HistoryWhen = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-variant: tabular-nums;
`;

const RoleRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const RoleButton = styled(PressableScale)<{ $selected: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.tiny + 2}px;
  min-height: 48px;
  padding: 0px 14px;
  border: 1px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.accent : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.selected : theme.colors.card};
`;

/** `PressableScale` hands the style to the `Pressable` and keeps the children
 * inside an `Animated.View` of its own, so the row has to be declared here:
 * on the pill itself it would only lay out that single wrapper. */
const RoleContent = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.tiny + 2}px;
  min-height: 48px;
`;

/** The check keeps its own square so the pill never wraps the word to a
 * second line: a role reads on one line or it is not a pill. */
const RoleCheck = styled.View`
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
`;

const RoleButtonText = styled.Text<{ $selected: boolean }>`
  flex-shrink: 0;
  color: ${({ theme, $selected }) =>
    $selected ? theme.colors.onSelected : theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 800;
`;

const Note = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const MemberRow = styled(Animated.View)<{ $last: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 4}px;
  min-height: 48px;
  padding: ${({ theme }) => theme.spacing.small + 4}px 0px;
  border-bottom-width: ${({ $last }) => ($last ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
`;

const MemberInfo = styled.View`
  flex: 1;
`;

const MemberName = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 700;
`;

const MemberSub = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
`;

const RoleTag = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
`;

const RemoveButton = styled(PressableScale)`
  padding: ${({ theme }) => theme.spacing.tiny}px;
`;

const RemoveText = styled.Text`
  color: ${({ theme }) => theme.colors.danger};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;

const ErrorBanner = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.small}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  padding: ${({ theme }) => theme.spacing.small + 4}px
    ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const ErrorText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.label}px;
  line-height: ${({ theme }) => theme.type.label + 5}px;
`;

const RetryButton = styled(PressableScale)`
  padding: 8px 12px;
`;

const RetryText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
`;

/* The negative margin cancels the link's own touch padding, so the word lines
   up with the sheet's left edge instead of sitting one notch inside it. */
const StopRow = styled.View`
  flex-direction: row;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
  margin-left: -${({ theme }) => theme.spacing.small}px;
`;

const StopLink = styled(PressableScale)`
  min-height: 48px;
  justify-content: center;
  padding: 0px ${({ theme }) => theme.spacing.small}px;
`;

const StopLinkText = styled.Text.attrs(buttonTextAttrs)`
  color: ${({ theme }) => theme.colors.danger};
  ${({ theme }) => buttonTextMetrics(theme.type.label)}
  font-weight: 700;
`;
