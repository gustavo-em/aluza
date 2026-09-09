import {
  findListByName,
  INBOX_LIST_ID,
  sanitizeLists,
} from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { displayNameOf } from '../src/features/tasks/presentation/models/listName';

// What a phone that installed a version before 1.4 still holds on disk.
const storedInbox = {
  id: INBOX_LIST_ID,
  name: 'Caixa',
  color: 'sun',
  icon: 'inbox',
} as const;

describe('the inbox name', () => {
  it('is said in the app language, whatever an older install stored', () => {
    expect(displayNameOf(storedInbox, getTaskCopy('en-US'))).toBe('Inbox');
    expect(displayNameOf(storedInbox, getTaskCopy('pt-BR'))).toBe('Avulsas');
  });

  it('leaves every other space with the name its people gave it', () => {
    expect(
      displayNameOf({ id: 'casa', name: 'Casa' }, getTaskCopy('en-US')),
    ).toBe('Casa');
  });

  it('answers to its old name and its English one when typed', () => {
    const lists = sanitizeLists([storedInbox]);

    for (const typed of ['Caixa', 'caixa', 'Avulsas', 'Inbox']) {
      expect(findListByName(lists, typed)?.id).toBe(INBOX_LIST_ID);
    }

    expect(findListByName(lists, 'Casa')).toBeNull();
  });

  it('is stored under its current name from the next load on', () => {
    expect(sanitizeLists([storedInbox])[0].name).toBe('Avulsas');
  });
});
