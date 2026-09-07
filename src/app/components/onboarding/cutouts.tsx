import Svg, { Path } from 'react-native-svg';
import styled from 'styled-components/native';

import { brandGround } from '../../theme/brandGround';
import type { TaskCopy } from '../../../features/tasks/presentation/localization/taskCopy';

/** The fixed cast the cut-outs are written with. Taken from the app's own
 * dictionary so the fake screen speaks the language the reader chose, and so
 * the space is named in one place — the walk-through and the entrance screen
 * show the same "Casa". */
export type CutoutDemo = TaskCopy['onboarding']['demo'];

/**
 * The three cut-outs the walk-through shows.
 *
 * Each step proves the product with a piece of the product, not with a drawing
 * of it: the space screen, the shared day card, the two "today" cards. They are
 * built here rather than screenshotted so they follow the phone's width, the
 * font scale and the app's language — a PNG of a Portuguese screen under
 * English words was the reason the stills went away.
 *
 * Nothing in here is interactive. The whole layer is handed `pointerEvents`
 * "none" by the screen that mounts it, and the data is the fixed cast the
 * design names: Casa, Você e Júlia, Léo, Marcos.
 */

/** The check inside a closed task's box. */
function Check({ color }: { color: string }) {
  return (
    <Svg height={11} viewBox="0 0 13 11" width={13}>
      <Path
        d="M1.5 5.5 5 9l6.5-7.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
    </Svg>
  );
}

/** The back chevron on the space screen's eyebrow. */
function Back({ color }: { color: string }) {
  return (
    <Svg height={14} viewBox="0 0 14 14" width={14}>
      <Path
        d="M9 2.5 4.5 7 9 11.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

type TaskState = 'done' | 'focus' | 'open';

/**
 * One row of a list: the box, the title, and who moved it. A closed task is
 * struck through and greyed; the one in focus keeps the reminder colour it has
 * everywhere else in the app.
 */
function TaskRow({
  meta,
  metaFocus = false,
  state,
  title,
}: {
  meta: string;
  metaFocus?: boolean;
  state: TaskState;
  title: string;
}) {
  return (
    <Row>
      {state === 'done' ? (
        <BoxDone>
          <Check color={brandGround.cardInk} />
        </BoxDone>
      ) : state === 'focus' ? (
        <BoxFocus>
          <FocusDot />
        </BoxFocus>
      ) : (
        <BoxOpen />
      )}
      <RowText>
        <RowTitle $done={state === 'done'}>{title}</RowTitle>
        <RowMeta $focus={metaFocus}>{meta}</RowMeta>
      </RowText>
    </Row>
  );
}

/** A round initial, the same tones the app gives its members. */
function Initial({
  color,
  initial,
  ring,
  size = 34,
}: {
  color: string;
  initial: string;
  ring: string;
  size?: number;
}) {
  return (
    <Disc $color={color} $ring={ring} $size={size}>
      <DiscText $size={size}>{initial}</DiscText>
    </Disc>
  );
}

/* ── Step 1 · the space ─────────────────────────────────────────────────── */

/**
 * The Casa screen, bleeding off the right edge and the bottom inside an ink
 * frame — the phone the words are talking about, held at an angle to the page
 * so it reads as a piece of the product rather than as a boxed screenshot.
 */
export function SpaceCutout({ demo }: { demo: CutoutDemo }) {
  return (
    <CutoutRoot>
      <Frame>
        <FramePaper>
          <Eyebrow>
            <Back color={brandGround.cardMuted} />
            <EyebrowText>{demo.spacesLabel}</EyebrowText>
          </Eyebrow>

          <SpaceHead>
            <SpaceHeadText>
              <SpaceName>{demo.spaceName}</SpaceName>
              <SpaceMeta>{demo.spaceMeta}</SpaceMeta>
            </SpaceHeadText>
            <Stack>
              <Initial
                color={brandGround.memberCoral}
                initial="M"
                ring={brandGround.paper}
              />
              <Overlap>
                <Initial
                  color={brandGround.memberOcean}
                  initial="J"
                  ring={brandGround.paper}
                />
              </Overlap>
            </Stack>
          </SpaceHead>

          <SpaceCard>
            <CardTitle>{demo.combined}</CardTitle>
            <TaskRow
              meta={demo.taskCarMeta}
              state="done"
              title={demo.taskCar}
            />
            <TaskRow
              meta={demo.taskCribMeta}
              metaFocus
              state="focus"
              title={demo.taskCrib}
            />
          </SpaceCard>
        </FramePaper>
      </Frame>

      <MemberPill>
        <Stack>
          <Initial
            color={brandGround.memberCoral}
            initial="M"
            ring={brandGround.tinta}
          />
          <Overlap>
            <Initial
              color={brandGround.memberOcean}
              initial="J"
              ring={brandGround.tinta}
            />
          </Overlap>
        </Stack>
        <MemberPillText>{demo.spacePill}</MemberPillText>
      </MemberPill>
    </CutoutRoot>
  );
}

/* ── Step 2 · the day ───────────────────────────────────────────────────── */

/**
 * The shared day card alone, with no phone around it: this step is about the
 * card, so a frame would only add furniture. The focus pill and the count
 * escape its corners the way they do on the store screenshots.
 */
export function DayCutout({ demo }: { demo: CutoutDemo }) {
  return (
    <CutoutRoot>
      <DayCard>
        <CardHead>
          <CardTitle>{demo.combined}</CardTitle>
          <CardCount>{demo.countSplit}</CardCount>
        </CardHead>
        <TaskRow meta={demo.taskStayMeta} state="done" title={demo.taskStay} />
        <TaskRow meta={demo.person2} state="open" title={demo.taskFlights} />
        <Rule />
        <TaskRow
          meta={demo.taskPassportMeta}
          state="done"
          title={demo.taskPassport}
        />
        <TaskRow meta={demo.you} state="open" title={demo.taskRoute} />
      </DayCard>

      <FocusPill>
        <Initial
          color={brandGround.memberOcean}
          initial="L"
          ring="transparent"
          size={30}
        />
        <FocusPillText>{demo.focusPill}</FocusPillText>
      </FocusPill>

      <CountCard>
        <CountEyebrow>{demo.today}</CountEyebrow>
        <CountValue>{demo.countSplit}</CountValue>
      </CountCard>
    </CutoutRoot>
  );
}

/* ── Step 3 · the invite ────────────────────────────────────────────────── */

/**
 * The message that carries the link, and the space a moment later. Two cards
 * tilted away from each other like the ones before them, but nothing in them
 * is a number: this step is about how the other person gets in, because the
 * button right under it is the one that sends the link.
 */
export function InviteCutout({ demo }: { demo: CutoutDemo }) {
  return (
    <CutoutRoot>
      <InviteBubble>
        <InviteBubbleText>{demo.inviteBubble}</InviteBubbleText>
        <InviteLinkText>{demo.inviteLink}</InviteLinkText>
        <InviteBubbleMeta>{demo.inviteBubbleMeta}</InviteBubbleMeta>
      </InviteBubble>

      <InviteJoined>
        <InviteJoinedTitle>{demo.inviteJoinedTitle}</InviteJoinedTitle>
        <InviteJoinedMeta>{demo.inviteJoinedMeta}</InviteJoinedMeta>
      </InviteJoined>
    </CutoutRoot>
  );
}

/* ── The entrance screen ────────────────────────────────────────────────── */

/**
 * The same Casa screen as step 1, a size down and with nothing floating over
 * it: the entrance already carries the mark, the promise and four buttons, so
 * the cut-out here only has to prove the product is real.
 */
export function EntranceCutout({ demo }: { demo: CutoutDemo }) {
  return (
    <CutoutRoot>
      <EntranceFrame>
        <EntrancePaper>
          <EyebrowText>{demo.spacesLabel}</EyebrowText>
          <EntranceSpaceName>{demo.spaceName}</EntranceSpaceName>
          <EntranceSpaceMeta>{demo.spaceMeta}</EntranceSpaceMeta>

          <EntranceCard>
            <EntranceCardTitle>{demo.combined}</EntranceCardTitle>
            <EntranceRow>
              <EntranceBoxDone>
                <Check color={brandGround.cardInk} />
              </EntranceBoxDone>
              <RowText>
                <EntranceRowTitle $done>{demo.taskCar}</EntranceRowTitle>
                <EntranceRowMeta $focus={false}>
                  {demo.taskCarMeta}
                </EntranceRowMeta>
              </RowText>
            </EntranceRow>
            <EntranceRow>
              <EntranceBoxFocus>
                <FocusDot />
              </EntranceBoxFocus>
              <RowText>
                <EntranceRowTitle $done={false}>
                  {demo.taskCrib}
                </EntranceRowTitle>
                <EntranceRowMeta $focus>{demo.taskCribMeta}</EntranceRowMeta>
              </RowText>
            </EntranceRow>
          </EntranceCard>
        </EntrancePaper>
      </EntranceFrame>
    </CutoutRoot>
  );
}

/* ── Shapes ─────────────────────────────────────────────────────────────── */

const CutoutRoot = styled.View`
  flex: 1;
  position: relative;
`;

/** The ink frame runs past the right edge and the bottom so the screen inside
 * it reads as continuing outside the page, not as a card that ended. */
const Frame = styled.View`
  position: absolute;
  left: 36px;
  right: -40px;
  top: 0;
  bottom: -30px;
  background-color: ${brandGround.tinta};
  border-top-left-radius: 38px;
  padding: 9px 0 0 9px;
`;

const FramePaper = styled.View`
  flex: 1;
  background-color: ${brandGround.paper};
  border-top-left-radius: 30px;
  overflow: hidden;
  padding: 22px 0 0 20px;
`;

const Eyebrow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
`;

const EyebrowText = styled.Text`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.8px;
  color: ${brandGround.cardMuted};
`;

const SpaceHead = styled.View`
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
  margin-top: 10px;
  padding-right: 60px;
`;

const SpaceHeadText = styled.View`
  flex-shrink: 1;
`;

const SpaceName = styled.Text`
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -1.1px;
  color: ${brandGround.cardInk};
`;

const SpaceMeta = styled.Text`
  font-size: 13px;
  font-weight: 500;
  color: ${brandGround.cardMuted};
  margin-top: 8px;
`;

const Stack = styled.View`
  flex-direction: row;
`;

const Overlap = styled.View`
  margin-left: -10px;
`;

const Disc = styled.View<{ $color: string; $ring: string; $size: number }>`
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  border-radius: 999px;
  background-color: ${({ $color }) => $color};
  align-items: center;
  justify-content: center;
  border-width: 2px;
  border-color: ${({ $ring }) => $ring};
`;

const DiscText = styled.Text<{ $size: number }>`
  font-size: ${({ $size }) => Math.round($size * 0.38)}px;
  font-weight: 800;
  color: #ffffff;
`;

const SpaceCard = styled.View`
  margin-top: 20px;
  margin-right: 60px;
  background-color: ${brandGround.card};
  border-radius: 20px;
  padding: 16px;
`;

const DayCard = styled.View`
  position: absolute;
  left: 24px;
  right: 24px;
  top: 0;
  background-color: ${brandGround.card};
  border-radius: 20px;
  padding: 16px;
`;

const CardHead = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.Text`
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: ${brandGround.cardInk};
`;

const CardCount = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: ${brandGround.cardMuted};
`;

const Rule = styled.View`
  height: 1px;
  background-color: ${brandGround.cardLine};
  margin: 14px 0;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
`;

const RowText = styled.View`
  flex-shrink: 1;
`;

const RowTitle = styled.Text<{ $done: boolean }>`
  font-size: 15px;
  font-weight: 500;
  color: ${({ $done }) =>
    $done ? brandGround.cardMuted : brandGround.cardInk};
  text-decoration-line: ${({ $done }) => ($done ? 'line-through' : 'none')};
`;

const RowMeta = styled.Text<{ $focus: boolean }>`
  font-size: 12px;
  font-weight: 500;
  color: ${({ $focus }) =>
    $focus ? brandGround.focusInk : brandGround.cardMuted};
  margin-top: 2px;
`;

const BoxDone = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background-color: ${brandGround.sol};
  align-items: center;
  justify-content: center;
`;

const BoxFocus = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  border-width: 2px;
  border-color: ${brandGround.focusInk};
  align-items: center;
  justify-content: center;
`;

const FocusDot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background-color: ${brandGround.focusInk};
`;

const BoxOpen = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  border-width: 2px;
  border-color: ${brandGround.cardBorder};
`;

/** Tilted a touch off the frame's corner, the way a sticker sits on a page. */
const MemberPill = styled.View`
  position: absolute;
  left: -6px;
  top: 30%;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  background-color: ${brandGround.tinta};
  border-radius: 999px;
  padding: 8px 18px 8px 8px;
  transform: rotate(-6deg);
`;

const MemberPillText = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: #fffdf7;
`;

const FocusPill = styled.View`
  position: absolute;
  left: -8px;
  top: 60%;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  background-color: ${brandGround.focusInk};
  border-radius: 999px;
  padding: 10px 18px 10px 10px;
  transform: rotate(-6deg);
`;

const FocusPillText = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: #fffdf7;
`;

const CountCard = styled.View`
  position: absolute;
  right: 16px;
  top: 55%;
  background-color: ${brandGround.sol};
  border-radius: 16px;
  padding: 12px 18px;
  transform: rotate(5deg);
`;

const CountEyebrow = styled.Text`
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1.8px;
  color: ${brandGround.onSol};
`;

const CountValue = styled.Text`
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -1.2px;
  color: ${brandGround.onSol};
  margin-top: 4px;
`;

const InviteBubble = styled.View`
  position: absolute;
  left: 20px;
  top: 0;
  width: 190px;
  background-color: ${brandGround.tinta};
  border-radius: 20px;
  border-bottom-left-radius: 6px;
  padding: 14px 16px;
  transform: rotate(-4deg);
`;

const InviteBubbleText = styled.Text`
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
  color: #fffdf7;
`;

const InviteLinkText = styled.Text`
  font-size: 15px;
  font-weight: 800;
  line-height: 20px;
  color: ${brandGround.sol};
`;

const InviteBubbleMeta = styled.Text`
  font-size: 11px;
  font-weight: 600;
  color: ${brandGround.onTintaSubtle};
  margin-top: 8px;
  text-align: right;
`;

const InviteJoined = styled.View`
  position: absolute;
  right: 16px;
  top: 46%;
  width: 176px;
  background-color: ${brandGround.card};
  border-radius: 20px;
  padding: 16px 18px;
  transform: rotate(4deg);
`;

const InviteJoinedTitle = styled.Text`
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.6px;
  color: ${brandGround.cardInk};
`;

const InviteJoinedMeta = styled.Text`
  font-size: 12px;
  font-weight: 600;
  color: ${brandGround.cardMuted};
  margin-top: 6px;
`;

/** Same bleed as the walk-through's frame, one radius step smaller: the
 * entrance holds more furniture above it, so the frame reads quieter. */
const EntranceFrame = styled.View`
  position: absolute;
  left: 40px;
  right: -30px;
  top: 0;
  bottom: 0;
  background-color: ${brandGround.tinta};
  border-top-left-radius: 34px;
  padding: 9px 0 0 9px;
`;

const EntrancePaper = styled.View`
  flex: 1;
  background-color: ${brandGround.paper};
  border-top-left-radius: 26px;
  overflow: hidden;
  padding: 20px 0 0 18px;
`;

const EntranceSpaceName = styled.Text`
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -1px;
  color: ${brandGround.cardInk};
  margin-top: 8px;
`;

const EntranceSpaceMeta = styled.Text`
  font-size: 13px;
  font-weight: 500;
  color: ${brandGround.cardMuted};
  margin-top: 6px;
`;

const EntranceCard = styled.View`
  margin-top: 16px;
  margin-right: 52px;
  background-color: ${brandGround.card};
  border-radius: 18px;
  padding: 14px;
`;

const EntranceCardTitle = styled(CardTitle)`
  font-size: 14px;
`;

const EntranceRow = styled(Row)`
  gap: 11px;
  margin-top: 12px;
`;

const EntranceRowTitle = styled(RowTitle)`
  font-size: 14px;
`;

const EntranceRowMeta = styled(RowMeta)`
  font-size: 11px;
`;

const EntranceBoxDone = styled(BoxDone)`
  width: 24px;
  height: 24px;
  border-radius: 8px;
`;

const EntranceBoxFocus = styled(BoxFocus)`
  width: 24px;
  height: 24px;
  border-radius: 8px;
`;
