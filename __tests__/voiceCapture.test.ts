import {
  VOICE_LIMITS,
  confirmable,
  initialVoiceState,
  reduce,
  settlingPhase,
  silenceFraction,
  silenceVerdict,
  type ParsedTask,
  type VoiceState,
} from '../src/features/tasks/presentation/models/voiceCapture';

const NOW = new Date(2026, 8, 16, 9, 0).getTime();
const TOMORROW = NOW + 24 * 60 * 60 * 1000;

function task(title: string, extra: Partial<ParsedTask> = {}): ParsedTask {
  return { title, dueAtMs: null, priority: null, remind: false, ...extra };
}

function recording(): VoiceState {
  return reduce({ s: 'ready', notice: null }, { t: 'tapDisc' }, NOW);
}

function settling(byLimit = false): VoiceState {
  return reduce(
    recording(),
    { t: 'stop', reason: byLimit ? 'limit' : 'tap', audioId: 'a1' },
    NOW,
  );
}

function previewOf(
  tasks: readonly ParsedTask[],
  projectId: string | null = null,
) {
  return reduce(settling(), { t: 'result', tasks, projectId }, NOW);
}

describe('which posture follows which event', () => {
  it('opens listening, or typing for somebody who has been typing', () => {
    expect(initialVoiceState(false)).toEqual({ s: 'ready', notice: null });
    expect(initialVoiceState(true)).toEqual({ s: 'typing' });
  });

  it('goes ready → recording → settling → preview', () => {
    expect(recording()).toEqual({ s: 'recording', startedAt: NOW });
    expect(settling(true)).toEqual({
      s: 'settling',
      startedAt: NOW,
      audioId: 'a1',
      byLimit: true,
    });
    expect(previewOf([task('pagar a luz')])).toMatchObject({ s: 'preview' });
  });

  it('touching the field is what makes it a typed capture, and back', () => {
    const typing = reduce(
      { s: 'ready', notice: null },
      { t: 'focusField' },
      NOW,
    );
    expect(typing).toEqual({ s: 'typing' });
    expect(reduce(typing, { t: 'tapDisc' }, NOW)).toEqual({
      s: 'recording',
      startedAt: NOW,
    });
  });

  it('says why it cannot listen, and stops saying it when it can', () => {
    const denied = reduce(
      recording(),
      { t: 'permission', granted: false },
      NOW,
    );
    expect(denied).toEqual({ s: 'ready', notice: 'denied' });
    expect(reduce(denied, { t: 'permission', granted: true }, NOW)).toEqual({
      s: 'ready',
      notice: null,
    });

    const offline = reduce({ s: 'typing' }, { t: 'offline', value: true }, NOW);
    expect(offline).toEqual({ s: 'ready', notice: 'offline' });
    expect(reduce(offline, { t: 'offline', value: false }, NOW)).toEqual({
      s: 'ready',
      notice: null,
    });
  });

  it('does not drop a recording because the network blinked', () => {
    expect(reduce(recording(), { t: 'offline', value: true }, NOW)).toEqual(
      recording(),
    );
  });

  it('turns each way of failing into the words for it', () => {
    const cases = [
      ['empty', 'empty'],
      ['network', 'offline'],
      ['server', 'failed'],
    ] as const;

    for (const [kind, notice] of cases) {
      expect(reduce(settling(), { t: 'error', kind }, NOW)).toEqual({
        s: 'ready',
        notice,
      });
    }
    // Nothing heard is the same as nothing said.
    expect(
      reduce(settling(), { t: 'result', tasks: [], projectId: null }, NOW),
    ).toEqual({ s: 'ready', notice: 'empty' });
  });
});

describe('correcting the preview', () => {
  it('keeps what fits and holds the rest for a second round', () => {
    const many = Array.from({ length: 23 }, (_, i) => task(`tarefa ${i + 1}`));
    const state = previewOf(many, 'casa');

    expect(state).toMatchObject({ s: 'preview' });
    if (state.s !== 'preview') throw new Error('not a preview');
    expect(state.draft.tasks).toHaveLength(VOICE_LIMITS.maxTasks);
    expect(state.draft.overflow).toHaveLength(3);
    expect(state.draft.projectId).toBe('casa');

    const second = reduce(state, { t: 'confirm' }, NOW);
    expect(second).toMatchObject({ s: 'preview' });
    if (second.s !== 'preview') throw new Error('not a preview');
    expect(second.draft.tasks.map(item => item.title)).toEqual([
      'tarefa 21',
      'tarefa 22',
      'tarefa 23',
    ]);
    expect(second.draft.overflow).toHaveLength(0);
    // Once nothing is left over, confirming closes the sheet.
    expect(reduce(second, { t: 'confirm' }, NOW)).toEqual({
      s: 'ready',
      notice: null,
    });
  });

  it('joins a row onto the one above it, taking the earlier date and the louder priority', () => {
    const state = previewOf([
      task('comprar ração', { dueAtMs: TOMORROW, remind: true }),
      task('Levar no veterinário', { priority: 'high', dueAtMs: null }),
    ]);

    const merged = reduce(state, { t: 'mergeUp', index: 1, joiner: 'e' }, NOW);
    if (merged.s !== 'preview') throw new Error('not a preview');

    expect(merged.draft.tasks).toHaveLength(1);
    expect(merged.draft.tasks[0]).toEqual({
      title: 'comprar ração e levar no veterinário',
      dueAtMs: TOMORROW,
      priority: 'high',
      remind: true,
    });
    // There is nothing above the first row to join it to.
    expect(reduce(state, { t: 'mergeUp', index: 0, joiner: 'e' }, NOW)).toBe(
      state,
    );
  });

  it('takes a row out and puts it back where it was, while the offer lasts', () => {
    const state = previewOf([task('a'), task('b'), task('c')]);
    const without = reduce(state, { t: 'remove', index: 1 }, NOW);
    if (without.s !== 'preview') throw new Error('not a preview');

    expect(without.draft.tasks.map(item => item.title)).toEqual(['a', 'c']);

    const back = reduce(without, { t: 'undoRemove' }, NOW + 1_000);
    if (back.s !== 'preview') throw new Error('not a preview');
    expect(back.draft.tasks.map(item => item.title)).toEqual(['a', 'b', 'c']);
    expect(back.draft.removed).toBeNull();

    // Past the offer, the row stays gone.
    expect(
      reduce(without, { t: 'undoRemove' }, NOW + VOICE_LIMITS.undoMs + 1),
    ).toBe(without);
  });

  it('refuses an empty title instead of creating a task with none', () => {
    const state = previewOf([task('pagar a luz')]);

    expect(reduce(state, { t: 'editTitle', index: 0, title: '   ' }, NOW)).toBe(
      state,
    );

    const renamed = reduce(
      state,
      { t: 'editTitle', index: 0, title: '  pagar a conta de luz ' },
      NOW,
    );
    if (renamed.s !== 'preview') throw new Error('not a preview');
    expect(renamed.draft.tasks[0].title).toBe('pagar a conta de luz');
  });

  it('sends the whole batch to one space, and says what a confirm would do', () => {
    const state = reduce(
      previewOf([task('a'), task('b')]),
      { t: 'setSpace', projectId: 'casa' },
      NOW,
    );

    expect(confirmable(state)).toEqual({
      tasks: [task('a'), task('b')],
      projectId: 'casa',
      remaining: 0,
    });
    expect(confirmable({ s: 'ready', notice: null })).toBeNull();
  });

  it('sets a deadline by hand, and forgets the words that are no longer true', () => {
    const state = previewOf([
      task('levar o cachorro', { dueAtMs: TOMORROW, dueSaid: 'sexta' }),
    ]);
    const moved = reduce(state, { t: 'setDue', index: 0, dueAtMs: NOW }, NOW);
    if (moved.s !== 'preview') throw new Error('not a preview');

    expect(moved.draft.tasks[0].dueAtMs).toBe(NOW);
    expect(moved.draft.tasks[0].dueSaid).toBeUndefined();

    const cleared = reduce(
      moved,
      { t: 'setDue', index: 0, dueAtMs: null },
      NOW,
    );
    if (cleared.s !== 'preview') throw new Error('not a preview');
    expect(cleared.draft.tasks[0].dueAtMs).toBeNull();
  });

  it('turns the priority chip a step at a time, starting from none', () => {
    let state = previewOf([task('pagar a luz')]);
    const seen: (string | null)[] = [];

    for (let round = 0; round < 5; round += 1) {
      state = reduce(state, { t: 'cyclePriority', index: 0 }, NOW);
      if (state.s !== 'preview') throw new Error('not a preview');
      seen.push(state.draft.tasks[0].priority);
    }

    expect(seen).toEqual(['low', 'medium', 'high', null, 'low']);
  });

  it('keeps the louder priority when two rows become one, and none when neither had one', () => {
    const loud = previewOf([
      task('a', { priority: 'low' }),
      task('b', { priority: 'high' }),
    ]);
    const merged = reduce(loud, { t: 'mergeUp', index: 1, joiner: 'e' }, NOW);
    if (merged.s !== 'preview') throw new Error('not a preview');
    expect(merged.draft.tasks[0].priority).toBe('high');

    const quiet = reduce(
      previewOf([task('a'), task('b')]),
      { t: 'mergeUp', index: 1, joiner: 'e' },
      NOW,
    );
    if (quiet.s !== 'preview') throw new Error('not a preview');
    expect(quiet.draft.tasks[0].priority).toBeNull();
  });

  it('turns the warning off, and loses it with the date', () => {
    const state = previewOf([
      task('pagar a luz', { dueAtMs: TOMORROW, remind: true }),
    ]);

    const quiet = reduce(state, { t: 'toggleRemind', index: 0 }, NOW);
    if (quiet.s !== 'preview') throw new Error('not a preview');
    expect(quiet.draft.tasks[0].remind).toBe(false);

    const loud = reduce(quiet, { t: 'toggleRemind', index: 0 }, NOW);
    if (loud.s !== 'preview') throw new Error('not a preview');
    expect(loud.draft.tasks[0].remind).toBe(true);

    // Nothing to be reminded of once the date is gone.
    const undated = reduce(loud, { t: 'setDue', index: 0, dueAtMs: null }, NOW);
    if (undated.s !== 'preview') throw new Error('not a preview');
    expect(undated.draft.tasks[0].remind).toBe(false);
  });

  it('starts over without keeping the old list', () => {
    expect(reduce(previewOf([task('a')]), { t: 'speakAgain' }, NOW)).toEqual({
      s: 'ready',
      notice: null,
    });
  });
});

describe('the clock the sheet is watching', () => {
  it('never holds a finished answer back, then admits it is slow, then gives up', () => {
    // No floor: an answer that arrived is shown the instant it arrives.
    expect(settlingPhase(NOW, NOW + 100)).toBe('writing');
    expect(settlingPhase(NOW, NOW + 2_000)).toBe('writing');
    expect(settlingPhase(NOW, NOW + VOICE_LIMITS.settlingSlowMs)).toBe('slow');
    expect(settlingPhase(NOW, NOW + VOICE_LIMITS.settlingMaxMs)).toBe(
      'expired',
    );
  });

  it('asks about a pause before it ever ends one', () => {
    // Nothing said yet: quiet means somebody has not started.
    expect(silenceVerdict(0, 9_000)).toBe('listening');
    // An ordinary pause mid-sentence is not the end of anything.
    expect(silenceVerdict(1_500, 1_500)).toBe('listening');
    expect(silenceVerdict(1_500, 2_000)).toBe('asking');
    expect(silenceVerdict(1_500, 3_900)).toBe('asking');
    expect(silenceVerdict(1_500, 4_000)).toBe('stop');
  });

  it('closes the ring across the pause it is asking about', () => {
    expect(silenceFraction(1_500, 1_000)).toBe(0);
    expect(silenceFraction(1_500, 2_000)).toBe(0);
    expect(silenceFraction(1_500, 3_000)).toBeCloseTo(0.5, 2);
    expect(silenceFraction(1_500, 4_000)).toBe(1);
  });
});
