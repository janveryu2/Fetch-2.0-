/**
 * study-notifications.ts
 *
 * Permissioned browser notifications for study timer completions and milestones.
 * Uses explicit user opt-in and graceful fallback when denied or unsupported.
 */

export type NotificationSupportStatus = "unsupported" | "default" | "granted" | "denied";

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationSupportStatus {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission as NotificationSupportStatus;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export interface StudyNotificationOptions {
  body?: string;
  tag?: string;
  silent?: boolean;
}

export function sendStudyNotification(
  title: string,
  options: StudyNotificationOptions = {},
): boolean {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    new Notification(title, {
      icon: "/assets/mascot/fetch-logo.png",
      badge: "/assets/mascot/fetch-logo.png",
      body: options.body || "Time to take a well-deserved break or start your next focus session.",
      tag: options.tag || "fetch-timer",
      silent: options.silent ?? false,
    });
    return true;
  } catch {
    // Some mobile or secure-context environments may throw on new Notification()
    return false;
  }
}
