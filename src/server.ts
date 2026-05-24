import cron from 'node-cron';
import { runDailyAlerts } from './jobs/dailyAlerts.js';

// Schedule the daily alerts job at 02:00 AM UTC (default schedule)
const dailyAlertsCron = cron.schedule('0 2 * * *', runDailyAlerts);

dailyAlertsCron.start();

export { dailyAlertsCron };
