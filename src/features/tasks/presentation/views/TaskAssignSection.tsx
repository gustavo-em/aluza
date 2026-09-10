import { AccessibilityInfo } from 'react-native';
import styled, { useTheme } from 'styled-components/native';

import { buttonTextAttrs } from '../../../../app/theme/buttonText';
import type { ListMember } from '../../domain/TaskList';
import type { TaskCopy } from '../localization/taskCopy';
import { memberDisplayName } from '../models/memberIdentity';
import { CheckGlyph } from './FieldGlyphs';
import { MemberChip } from './MemberChip';
import { PressableScale } from './PressableScale';

export interface TaskAssignment {
  /** Everybody in the project, in the order the project lists them. */
  members: readonly ListMember[];
  /** uids taking this task right now. */
  assignedIds: readonly string[];
  /** The signed-in account. */
  personId: string;
  onToggle: (personId: string) => void;
}

/**
 * Who took this task.
 *
 * Everybody who may edit the project sees the same thing: the shortcut for
 * themselves on top, and below it the project's members, each one a toggle.
 * A `viewer` never gets here at all — the screen leaves `assignment` out
 * instead of drawing controls that would only refuse the tap.
 */
export function TaskAssignSection({
  assignment,
  copy,
}: {
  assignment: TaskAssignment;
  copy: TaskCopy;
}) {
  const theme = useTheme();
  const { members, assignedIds, personId, onToggle } = assignment;

  const nameOf = (member: ListMember) =>
    member.personId === personId
      ? copy.lists.memberYou
      : memberDisplayName(member, copy.lists.memberSomeone);

  const toggle = (member: ListMember) => {
    const leaving = assignedIds.includes(member.personId);
    const name = nameOf(member);

    onToggle(member.personId);
    AccessibilityInfo.announceForAccessibility(
      leaving
        ? copy.lists.unassignedAnnouncement(name)
        : copy.lists.assignedAnnouncement(name),
    );
  };

  const me = members.find(member => member.personId === personId) ?? null;
  const iAmIn = assignedIds.includes(personId);

  return (
    <Section testID="task-assign-section">
      <SectionHeader>
        <SectionLabel>
          {assignedIds.length === 0
            ? copy.lists.assignSectionTitle.toUpperCase()
            : `${copy.lists.assignSectionTitle.toUpperCase()} · ${
                assignedIds.length
              }`}
        </SectionLabel>
        <SectionRule />
      </SectionHeader>

      {/* The shortcut for yourself, on top: the one move somebody makes over
        and over does not deserve a hunt down the list. */}
      <SelfButton
        $joined={iAmIn}
        accessibilityLabel={iAmIn ? copy.lists.leaveTask : copy.lists.joinTask}
        accessibilityRole="button"
        accessibilityState={{ selected: iAmIn }}
        onPress={() =>
          toggle(
            me ?? {
              personId,
              name: copy.lists.memberYou,
              handle: null,
              role: 'editor',
              joined: true,
            },
          )
        }
        testID="task-assign-self"
      >
        <SelfButtonText $joined={iAmIn}>
          {iAmIn ? copy.lists.leaveTask : copy.lists.joinTask}
        </SelfButtonText>
      </SelfButton>

      {members.map((member, index) => {
        const checked = assignedIds.includes(member.personId);
        const name = nameOf(member);

        return (
          <MemberRow
            $last={index === members.length - 1}
            accessibilityLabel={
              checked
                ? copy.lists.unassignPerson(name)
                : copy.lists.assignPerson(name)
            }
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            key={member.personId}
            onPress={() => toggle(member)}
            scaleTo={0.99}
            testID={`task-assign-${member.personId}`}
          >
            <MemberChip
              initials={
                member.personId === personId
                  ? copy.lists.memberYouInitials
                  : undefined
              }
              name={name}
              personId={member.personId}
              photoURL={member.photoURL ?? null}
              pending={!member.joined}
              size="large"
            />
            <MemberInfo>
              <MemberName numberOfLines={1} ellipsizeMode="tail">
                {name}
              </MemberName>
              {member.handle == null ? null : (
                <MemberSub numberOfLines={1} ellipsizeMode="tail">
                  {`@${member.handle}`}
                </MemberSub>
              )}
            </MemberInfo>
            <CheckSlot $checked={checked}>
              {checked ? (
                <CheckGlyph color={theme.colors.onAccent} size={12} />
              ) : null}
            </CheckSlot>
          </MemberRow>
        );
      })}
    </Section>
  );
}

/* Held together by its label, its rule and the space around it: no box of its
   own, because the sheet is already a surface. */
const Section = styled.View`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const SectionHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
`;

const SectionRule = styled.View`
  flex: 1;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.borderSubtle};
`;

const MemberRow = styled(PressableScale)<{ $last: boolean }>`
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

/** An empty ring when the person is out, the accent disc with a check when
 * they are in: the ring is what says the row is a toggle at all — a bare
 * glyph that vanished when unchecked left nothing to press. */
const CheckSlot = styled.View<{ $checked: boolean }>`
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 2px solid
    ${({ theme, $checked }) =>
      $checked ? theme.colors.accent : theme.colors.border};
  background-color: ${({ theme, $checked }) =>
    $checked ? theme.colors.accent : theme.colors.card};
`;

const SelfButton = styled(PressableScale)<{ $joined: boolean }>`
  min-height: 48px;
  align-items: center;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.small}px;
  margin-bottom: ${({ theme }) => theme.spacing.small}px;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  border: 1px solid
    ${({ theme, $joined }) =>
      $joined ? theme.colors.border : theme.colors.accent};
  background-color: ${({ theme, $joined }) =>
    $joined ? theme.colors.selected : theme.colors.accent};
`;

const SelfButtonText = styled.Text.attrs(buttonTextAttrs)<{ $joined: boolean }>`
  color: ${({ theme, $joined }) =>
    $joined ? theme.colors.onSelected : theme.colors.onAccent};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 800;
`;
