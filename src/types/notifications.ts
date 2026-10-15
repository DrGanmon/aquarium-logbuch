export type SocialNotificationType = 'like' | 'comment';

export interface SocialNotification {
  id: number;
  user_id: number;
  actor_id: number;
  post_id: number;
  comment_id: number | null;
  type: SocialNotificationType;
  created_at: string;
  read_at: string | null;
}
