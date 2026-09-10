/**
 * What a tap on the tab that is already open means.
 *
 * A tab bar is not only a way in: on both platforms the tab already showing is
 * the way back out, one level at a time. The rule lives here, away from any
 * screen, so it can be read and tested without a device: the screens only carry
 * out the answer.
 *
 * Nothing here closes a sheet. A sheet in front of the screen is the thing
 * being answered, so the tap is ignored while one is open.
 */

/** The spaces tab, from the deepest level outwards. */
export type SpacesReselectAction =
  | 'ignore'
  | 'closeGroup'
  | 'closeSpace'
  | 'scrollTop';

/** The profile tab, which has one screen over its root. */
export type YouReselectAction = 'ignore' | 'closeProfile' | 'scrollTop';

/** Every other tab is flat: there is nothing to leave, only somewhere to go. */
export type FlatReselectAction = 'ignore' | 'scrollTop';

export function spacesReselectAction({
  blocked,
  openListId,
  openGroupId,
}: {
  blocked: boolean;
  openListId: string | null;
  openGroupId: string | null;
}): SpacesReselectAction {
  if (blocked) return 'ignore';
  // One tap, one level: a group inside a space lands on the space, never
  // straight on the index.
  if (openGroupId != null && openListId != null) return 'closeGroup';
  if (openListId != null) return 'closeSpace';

  return 'scrollTop';
}

export function youReselectAction({
  blocked,
  route,
}: {
  blocked: boolean;
  route: 'root' | 'profile';
}): YouReselectAction {
  if (blocked) return 'ignore';

  return route === 'profile' ? 'closeProfile' : 'scrollTop';
}

export function flatReselectAction({
  blocked,
}: {
  blocked: boolean;
}): FlatReselectAction {
  return blocked ? 'ignore' : 'scrollTop';
}
