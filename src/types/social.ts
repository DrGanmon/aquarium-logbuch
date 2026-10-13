export interface SocialPost { id: number; user_id: number; filename: string; width: number; height: number; text: string; created_at: string }
export interface SocialComment { id: number; post_id: number; user_id: number; text: string; created_at: string }
export interface SocialLike { post_id: number; user_id: number }
export interface SocialAuthor { id: number; username: string; avatarUrl: string | null }
export interface SocialPostView extends Omit<SocialPost, 'filename' | 'user_id'> {
  author: SocialAuthor; imageUrl: string; likeCount: number; commentCount: number; liked: boolean; canDelete: boolean;
}
export interface SocialCommentView extends Omit<SocialComment, 'user_id'> { author: SocialAuthor; canDelete: boolean }
