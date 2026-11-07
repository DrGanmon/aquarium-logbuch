export interface SocialPost { id: number; user_id: number; filename: string; width: number; height: number; text: string; created_at: string; is_public: boolean | number }
export interface SocialComment { id: number; post_id: number; user_id: number; text: string; created_at: string }
export interface SocialLike { post_id: number; user_id: number }
/** profileUrl is set when the author's social profile is visible to the current viewer. */
export interface SocialAuthor { id: number; username: string; avatarUrl: string | null; profileUrl: string | null }
/** Stored opt-in profile; future profile fields are added here. */
export interface SocialProfile { user_id: number; enabled: boolean; created_at: string; updated_at: string }
/**
 * Public representation of a profile. postCount and the listed posts only include what the viewer may
 * see: public posts for guests, public and internal posts for signed-in members. Extend with new
 * sections without changing existing fields.
 */
export interface SocialProfileView { username: string; avatarUrl: string | null; enabled: boolean; isOwner: boolean; postCount: number }
export interface SocialPostView extends Omit<SocialPost, 'filename' | 'user_id'> {
  author: SocialAuthor; imageUrl: string; likeCount: number; commentCount: number; liked: boolean; canDelete: boolean;
}
export interface SocialCommentView extends Omit<SocialComment, 'user_id'> { author: SocialAuthor; canDelete: boolean }
