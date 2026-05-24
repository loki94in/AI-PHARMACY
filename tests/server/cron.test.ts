import cron from 'node-cron';
import { jest } from '@jest/globals';

describe('Cron scheduling', () => {
  beforeEach(() => {
    // Spy on cron.schedule and replace with mock implementation
    jest.spyOn(cron, 'schedule').mockImplementation(() => ({ start: jest.fn() } as any));
  });

  afterEach(() => {
    // Restore original schedule implementation after each test
    (cron.schedule as any).mockRestore?.();
  });

  test('cron job is scheduled with correct pattern and runDailyAlerts exists', async () => {
    // Import server after spy is set up
    const server = await import('../../src/server.js');
    const { runDailyAlerts } = await import('../../src/jobs/dailyAlerts.js');

    expect(cron.schedule).toHaveBeenCalledWith('0 2 * * *', expect.any(Function));
    expect(typeof runDailyAlerts).toBe('function');
    // Verify that the scheduled task's start method was called
    const scheduledTask = (cron.schedule as jest.Mock).mock.results[0].value;
    expect(scheduledTask.start).toHaveBeenCalled();
  });
});
