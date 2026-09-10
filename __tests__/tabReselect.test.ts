import {
  flatReselectAction,
  spacesReselectAction,
  youReselectAction,
} from '../src/app/navigation/tabReselect';

describe('tapping the tab that is already open', () => {
  it('walks out of the spaces tab one level at a time', () => {
    // Inside a group: the first tap lands on the space it belongs to.
    expect(
      spacesReselectAction({
        blocked: false,
        openListId: 'casa',
        openGroupId: 'festa',
      }),
    ).toBe('closeGroup');

    // The space, now on its own: the second tap lands on the index.
    expect(
      spacesReselectAction({
        blocked: false,
        openListId: 'casa',
        openGroupId: null,
      }),
    ).toBe('closeSpace');

    // The index has nowhere to go back to, so the tap takes it to the top.
    expect(
      spacesReselectAction({
        blocked: false,
        openListId: null,
        openGroupId: null,
      }),
    ).toBe('scrollTop');
  });

  it('never leaves two levels on one tap', () => {
    const fromGroup = spacesReselectAction({
      blocked: false,
      openListId: 'casa',
      openGroupId: 'festa',
    });

    expect(fromGroup).not.toBe('closeSpace');
    expect(fromGroup).not.toBe('scrollTop');
  });

  it('ignores a group id left behind with no space open', () => {
    expect(
      spacesReselectAction({
        blocked: false,
        openListId: null,
        openGroupId: 'festa',
      }),
    ).toBe('scrollTop');
  });

  it('does nothing while a sheet is in front of the screen', () => {
    expect(
      spacesReselectAction({
        blocked: true,
        openListId: 'casa',
        openGroupId: 'festa',
      }),
    ).toBe('ignore');

    expect(
      spacesReselectAction({
        blocked: true,
        openListId: null,
        openGroupId: null,
      }),
    ).toBe('ignore');

    expect(youReselectAction({ blocked: true, route: 'profile' })).toBe(
      'ignore',
    );

    expect(flatReselectAction({ blocked: true })).toBe('ignore');
  });

  it('leaves the profile screen before it touches the scroll', () => {
    expect(youReselectAction({ blocked: false, route: 'profile' })).toBe(
      'closeProfile',
    );

    expect(youReselectAction({ blocked: false, route: 'root' })).toBe(
      'scrollTop',
    );
  });

  it('takes a flat tab back to the top', () => {
    expect(flatReselectAction({ blocked: false })).toBe('scrollTop');
  });
});
