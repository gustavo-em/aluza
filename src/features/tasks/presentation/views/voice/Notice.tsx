import styled from 'styled-components/native';

/**
 * What the sheet says instead of the staff: no network, no microphone,
 * nothing heard. It takes the staff's own place rather than appearing above
 * it, so the sheet does not change height to deliver bad news — a sheet that
 * jumps under a thumb reads as a failure of its own.
 */

const Box = styled.View`
  background-color: ${({ theme }) => theme.colors.cardNeutral};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  justify-content: center;
  min-height: 100px;
  padding: 12px 14px;
  width: 100%;
`;

const Line = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: 13px;
  line-height: 19px;
`;

const Lead = styled(Line)`
  font-weight: 700;
`;

const Rest = styled(Line)`
  font-weight: 500;
  margin-top: 4px;
`;

interface NoticeProps {
  /** The sentence that says what happened. */
  title: string;
  /** What to do about it, if there is anything. */
  hint?: string;
  testID?: string;
}

export function Notice({ title, hint, testID }: NoticeProps) {
  return (
    <Box accessibilityRole="alert" testID={testID}>
      <Lead>{title}</Lead>
      {hint == null ? null : <Rest>{hint}</Rest>}
    </Box>
  );
}
