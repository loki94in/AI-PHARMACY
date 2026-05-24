import { runDailyAlerts } from '../../src/jobs/dailyAlerts.js';

test('runDailyAlerts resolves without error', async () => {
  await expect(runDailyAlerts()).resolves.toBeUndefined();
});
