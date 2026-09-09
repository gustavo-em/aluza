import styled, { useTheme } from 'styled-components/native';

import type { TaskList } from '../../domain/TaskList';
import type { TaskCopy } from '../localization/taskCopy';
import { ProjectGlyph, PlusGlyph, TagGlyph } from './FieldGlyphs';
import { projectTone } from '../models/projectAppearance';
import { PressableScale } from './PressableScale';
import { PanelBox, PanelTitle } from './SheetPanel';
import { displayNameOf } from '../models/listName';

interface ListPanelProps {
  copy: TaskCopy;
  lists: readonly TaskList[];
  selectedId: string | null;
  onSelect: (listId: string | null) => void;
  onCreateNew?: () => void;
}

/**
 * Which list this belongs to.
 *
 * Cycling through the lists on one chip meant tapping four times to reach the
 * fourth, and never seeing what the choices were. They are shown, in the
 * colour each list already carries everywhere else in the app.
 */
export function ListPanel({
  copy,
  lists,
  selectedId,
  onSelect,
  onCreateNew,
}: ListPanelProps) {
  const theme = useTheme();

  return (
    <PanelBox>
      <PanelTitle>{copy.capture.spacePanelTitle}</PanelTitle>
      <Options>
        <Option
          $active={selectedId == null}
          accessibilityLabel={copy.capture.noList}
          accessibilityState={{ selected: selectedId == null }}
          onPress={() => onSelect(null)}
          testID="list-option-none"
        >
          <TagGlyph
            color={
              selectedId == null ? theme.colors.background : theme.colors.muted
            }
          />
          <OptionText $active={selectedId == null}>
            {copy.capture.noList}
          </OptionText>
        </Option>

        {lists.map(list => {
          const isChosen = list.id === selectedId;

          return (
            <Option
              $active={isChosen}
              accessibilityLabel={displayNameOf(list, copy)}
              accessibilityState={{ selected: isChosen }}
              key={list.id}
              onPress={() => onSelect(list.id)}
              testID={`list-option-${list.id}`}
            >
              <ProjectGlyph
                color={projectTone(theme, list.color)}
                icon={list.icon}
              />
              <OptionText $active={isChosen}>
                {displayNameOf(list, copy)}
              </OptionText>
            </Option>
          );
        })}

        {onCreateNew == null ? null : (
          <Option
            $active={false}
            accessibilityLabel={copy.lists.newList}
            onPress={onCreateNew}
            testID="list-option-new"
          >
            <PlusGlyph color={theme.colors.recognizedText} />
            <OptionText $active={false}>{copy.lists.newList}</OptionText>
          </Option>
        )}
      </Options>
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
  padding: 0px 13px;
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
