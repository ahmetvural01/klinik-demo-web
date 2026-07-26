-- Reminder dispatch (appointments/reminder-dispatch) needs an atomic claim
-- step between reading due reminders and sending SMS, to prevent two
-- concurrent invocations from both sending the same reminder twice.
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'GONDERILIYOR';
