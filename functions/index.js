/**
 * Layer B — the server half of project notifications.
 *
 * One trigger, one job: when a shared project changes, work out what happened
 * (a task was completed, or somebody joined) and push it to the other members'
 * devices. Nothing here is required for the app to work — while this is not
 * deployed, the app's own sync layer shows the same two facts.
 *
 * Deploying is a manual step for the project owner. See README.md.
 */
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

/** Same wording as the app, in both languages. The device's own language is
 * not known here, so the project's default is Portuguese with the English
 * copy kept next to it for a later per-user setting. */
const COPY = {
  'pt-BR': {
    completed: (person, title) => `${person} concluiu “${title}”`,
    joined: (person, project) => `${person} entrou em ${project}`,
    someone: 'Alguém do projeto',
  },
  'en-US': {
    completed: (person, title) => `${person} completed “${title}”`,
    joined: (person, project) => `${person} joined ${project}`,
    someone: 'Someone in the project',
  },
};

function membersOf(data) {
  return Array.isArray(data?.members) ? data.members : [];
}

function tasksOf(data) {
  return Array.isArray(data?.tasks) ? data.tasks : [];
}

function personLabel(member, copy, prefixHandle) {
  if (member == null) return copy.someone;
  const name = typeof member.name === 'string' ? member.name.trim() : '';
  const looksLikeAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name);

  if (name.length > 0 && !looksLikeAddress) return name;
  if (typeof member.handle === 'string' && member.handle.length > 0) {
    return prefixHandle ? `@${member.handle}` : member.handle;
  }

  return copy.someone;
}

/** Facts that exist after the write and did not exist before it. */
function diffEvents(before, after, copy, token) {
  const events = [];
  const projectName = typeof after?.name === 'string' ? after.name : '';
  const members = membersOf(after);

  const completedBefore = new Map(
    tasksOf(before)
      .filter(task => task.completedAtMs != null)
      .map(task => [task.id, task.completedAtMs]),
  );

  for (const task of tasksOf(after)) {
    if (task.completedAtMs == null || task.completedBy == null) continue;
    if (completedBefore.get(task.id) === task.completedAtMs) continue;

    const actor = members.find(m => m.personId === task.completedBy);
    events.push({
      actorId: task.completedBy,
      // Same key the app builds for the same fact, so the sync layer and this
      // push can never both show it.
      eventKey: `c:${token}:${task.id}:${task.completedAtMs}`,
      title: projectName,
      body: copy.completed(personLabel(actor, copy, false), task.title),
    });
  }

  const joinedBefore = new Set(
    membersOf(before)
      .filter(member => member.joined === true)
      .map(member => member.personId),
  );

  for (const member of members) {
    if (member.joined !== true || joinedBefore.has(member.personId)) continue;

    events.push({
      actorId: member.personId,
      eventKey: `j:${token}:${member.personId}`,
      title: projectName,
      body: copy.joined(personLabel(member, copy, true), projectName),
    });
  }

  return events;
}

async function tokensOf(uid) {
  const snapshot = await getFirestore()
    .collection('users')
    .doc(uid)
    .collection('fcmTokens')
    .get();

  return snapshot.docs.map(doc => doc.id);
}

// The public preview behind an invite link. Lives in its own file: it has
// nothing to do with notifications beyond sharing this project.
exports.invite = require('./invite').invite;
// A note in, task lines out — the batch capture sheet's reader on the server.
exports.interpretCapture = require('./interpret').interpretCapture;
// The same reader, fed by a recording instead of by typing.
exports.voiceCapture = require('./voice').voiceCapture;

exports.onSharedProjectWritten = onDocumentWritten(
  'sharedLists/{token}',
  async event => {
    const before = event.data?.before?.data() ?? null;
    const after = event.data?.after?.data() ?? null;
    if (after == null) return;

    const copy = COPY['pt-BR'];
    const token = event.params.token;
    const events = diffEvents(before, after, copy, token);
    if (events.length === 0) return;

    const memberIds = Array.isArray(after.memberIds) ? after.memberIds : [];

    for (const activity of events) {
      // Never the person who did it: their own doing is not news.
      const recipients = memberIds.filter(uid => uid !== activity.actorId);
      const tokens = (
        await Promise.all(recipients.map(uid => tokensOf(uid)))
      ).flat();

      if (tokens.length === 0) continue;

      // Data-only, never `notification`: a notification payload is drawn by
      // Android before the app runs any code, and the same fact would then be
      // shown again by the app's own sync detection. The client claims
      // `eventKey` in its ledger and only then shows the line.
      await getMessaging().sendEachForMulticast({
        tokens,
        data: {
          token,
          eventKey: activity.eventKey,
          title: activity.title,
          body: activity.body,
        },
        android: { priority: 'high' },
      });
    }
  },
);
