// Compatibility export for the already implemented Project Controls module. New code
// should use NotificationEntity because DB-105 is now shared by schedule and risk/change.
export { NotificationEntity as ScheduleNotificationEntity } from './notification.entity';
