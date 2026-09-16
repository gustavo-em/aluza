import styled, { useTheme } from 'styled-components/native';

import type { ListMember } from '../../domain/TaskList';
import type { TaskCopy } from '../localization/taskCopy';
import { memberDisplayName } from '../models/memberIdentity';
import { CheckGlyph } from './FieldGlyphs';
import { MemberChip } from './MemberChip';
import { PressableScale } from './PressableScale';
import { PanelBox, PanelTitle } from './SheetPanel';

interface AssignPanelProps {
  copy: TaskCopy;
  /** Everybody in the space, in the order the space lists them. */
  members: readonly ListMember[];
  /** uids on the task being written. */
  assignedIds: readonly string[];
  /** The signed-in account, read as "Você". */
  personId: string;
  onToggle: (personId: string) => void;
}

/**
 * Who takes the task, while it is still being written.
 *
 * The box the people chip opens into: the same mould the space chip uses, one
 * pill per person, filled with ink once they are on the task. It does the job
 * `TaskAssignSection` does inside an existing task, in the shape a chip's
 * panel has — the task does not exist yet, so there is no row to reopen.
 */
export function AssignPanel({
  copy,
  members,
  assignedIds,
  personId,
  onToggle,
}: AssignPanelProps) {
  const theme = useTheme();

  return (
    <PanelBox testID="capture-assign-panel">
      <PanelTitle>{copy.lists.assignSectionTitle}</PanelTitle>
      <Options>
        {members.map(member => {
          const checked = assignedIds.includes(member.personId);
          const isMe = member.personId === personId;
          const name = isMe
            ? copy.lists.memberYou
            : memberDisplayName(member, copy.lists.memberSomeone);

          return (
            <Option
              $active={checked}
              accessibilityLabel={
                checked
                  ? copy.lists.unassignPerson(name)
                  : copy.lists.assignPerson(name)
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              key={member.personId}
              onPress={() => onToggle(member.personId)}
              testID={`capture-assign-${member.personId}`}
            >
              <MemberChip
                initials={isMe ? copy.lists.memberYouInitials : undefined}
                name={name}
                pending={!member.joined}
                personId={member.personId}
                photoURL={member.photoURL ?? null}
                size="fact"
              />
              <OptionText $active={checked}>{name}</OptionText>
              {checked ? (
                <CheckGlyph color={theme.colors.background} size={12} />
              ) : null}
            </Option>
          );
        })}
      </Options>
      <Hint>{copy.capture.assignPanelHint}</Hint>
    </PanelBox>
  );
}

const Options = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const Option = styled(PressableScale)<{ $active: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small - 1}px;
  min-height: 36px;
  padding: 0px 13px 0px 8px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.text : theme.colors.border};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.text : theme.colors.card};
`;

const OptionText = styled.Text<{ $active: boolean }>`
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: ${({ $active }) => ($active ? 700 : 600)};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.background : theme.colors.mutedStrong};
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  line-height: ${({ theme }) => theme.type.caption + 5}px;
`;
