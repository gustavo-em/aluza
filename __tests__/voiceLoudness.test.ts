import { createLoudness } from '../src/features/tasks/infrastructure/voice/loudness';

/** What a Galaxy M53 and an iPhone 13 actually report, which is what the
 * fixed window used to be written against — one of them at a time. */
const ANDROID = { room: -63, speech: -39 };
const IOS = { room: -45, speech: -20 };

describe('the loudness a recording is drawn from', () => {
  it.each([
    ['android', ANDROID, -60],
    ['ios', IOS, -45],
  ])(
    'reads %s room tone as quiet and speech as loud',
    (_name, phone, guess) => {
      const loudness = createLoudness(guess);

      // The room comes first, as it does on a phone: a moment of nothing
      // before anybody speaks.
      let quiet = 0;
      for (let frame = 0; frame < 10; frame += 1) {
        quiet = loudness(phone.room);
      }

      expect(quiet).toBe(0);
      expect(loudness(phone.speech)).toBeGreaterThan(0.35);
    },
  );

  it('finds a room quieter than the guess', () => {
    // A silent bedroom on an iPhone, read against a guess made for a noisier
    // one: without the floor falling, every frame would read as speech.
    const loudness = createLoudness(-45);

    loudness(-58);
    expect(loudness(-58)).toBe(0);
    expect(loudness(-30)).toBeGreaterThan(0.35);
  });

  it('never rises with the room, so a passing lorry is not a voice', () => {
    const loudness = createLoudness(-60);

    loudness(-63);
    // Traffic outside: louder than the room, nowhere near somebody speaking.
    expect(loudness(-50)).toBeLessThan(0.35);
    expect(loudness(-39)).toBeGreaterThan(0.35);
  });

  it('reads nothing at all as quiet rather than as a shout', () => {
    const loudness = createLoudness(-60);

    expect(loudness(undefined)).toBe(0);
    expect(loudness(Number.NaN)).toBe(0);
  });
});
