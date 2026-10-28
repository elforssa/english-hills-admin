// One delivery per recipient across retries (audit POR-7, review S7). Each step of a
// recipient (save its message row, send its e-mail…) is recorded as soon as it
// succeeds, so a retry after a part-way failure skips every step already done:
// no second message row, no second e-mail to an earlier recipient.
//
//   const tracker = createDeliveryTracker();
//   await tracker.run(recipients, [['row', saveRow], ['email', sendEmail]]);
//
// A step receives (recipient, state) where state holds the earlier steps' results.
export function createDeliveryTracker(keyOf = recipient => String(recipient.email || '').trim().toLowerCase()) {
  const states = new Map();
  return {
    async run(recipients, steps) {
      for (const recipient of recipients) {
        const key = keyOf(recipient);
        const state = states.get(key) || {};
        states.set(key, state);
        for (const [name, step] of steps) {
          if (Object.hasOwn(state, name)) continue;
          state[name] = (await step(recipient, state)) ?? true;
        }
      }
      return recipients.map(recipient => states.get(keyOf(recipient)));
    },
    started: () => states.size > 0,
  };
}
