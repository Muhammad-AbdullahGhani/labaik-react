import { openDatabaseAsync } from 'expo-sqlite';
import { ActionQueue } from '../lib/queue';
let pending: Promise<ActionQueue> | undefined;
export function getQueue() {
  pending ??= openDatabaseAsync('labaik-actions.db')
    .then(async (db) => {
      const queue = new ActionQueue(db);
      await queue.init();
      return queue;
    })
    .catch((error) => {
      pending = undefined;
      throw error;
    });
  return pending;
}
