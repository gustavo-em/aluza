/**
 * Who is calling, and how much they have called today.
 *
 * Both reader endpoints — the typed note and the spoken one — ask the same
 * two questions before spending anything, and a spoken note costs more than
 * a typed one, so they count against the same allowance.
 */
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { DAILY_LIMIT } = require('./interpretCore');

/** The uid behind the session token the app sends. Null when nobody. */
async function callerOf(request) {
  const header = request.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token === '') return null;

  try {
    const decoded = await getAuth().verifyIdToken(token);

    return decoded.uid;
  } catch {
    return null;
  }
}

/** The local day, as the counter's key: one document per person per day. */
function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Counts `cost` reads for this account today and says whether it is still
 * within the day's allowance. A person never gets near the cap; a loop on a
 * broken phone does, and this is what keeps that from becoming a bill.
 */
async function withinDailyLimit(uid, cost = 1) {
  const ref = getFirestore().collection('interpretUsage').doc(uid);
  const key = dayKey();

  return getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const count = data.dayKey === key ? Number(data.count) || 0 : 0;

    if (count + cost > DAILY_LIMIT) return false;

    transaction.set(
      ref,
      {
        dayKey: key,
        count: count + cost,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return true;
  });
}

module.exports = { callerOf, dayKey, withinDailyLimit };
