import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import db = require('../db');
import authModule = require('../middleware/auth');
import source0 = require('../utils/cookies');
const { parseCookies } = source0;
import source1 = require('../utils/crypto');
const { sha } = source1;
import source2 = require('../config/env');
const { isEmailAdmin } = source2;
import { TERMS_VERSION } from '../services/terms-service';
import { AppError } from '../utils/app-error';
const wrap = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};
import source4 = require('../utils/rate-limit');
const { tooManyAttempts, noteAttempt } = source4;
import { saveSocialImage } from '../services/social-image-service';
import source5 = require('../services/image-service');
const { deleteImage, getImagePath, getMimeType } = source5;
import type { SocialPost, SocialAuthor } from '../types/social';
const { auth } = authModule;
const router = express.Router();
const id = (input: unknown) => {
  if (!/^\d+$/.test(String(input))) throw new AppError('Ungültige ID.', 400);
  const value = Number(input);if (!Number.isSafeInteger(value) || value < 1) throw new AppError('Ungültige ID.', 400);return value;
};
const before = (req: Request) => req.query.before === undefined ? Number.MAX_SAFE_INTEGER : id(req.query.before);
const text = (input: unknown, max: number, required = false) => {
  if (input !== undefined && typeof input !== 'string') throw new AppError('Ungültiger Text.', 400);
  const value = typeof input === 'string' ? input.trim() : '';
  if (value.length > max || (required && !value)) throw new AppError(`Text muss ${required ? '1' : '0'} bis ${max} Zeichen enthalten.`, 400);return value;
};
const viewer = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = parseCookies(req).session;
    const session = token ? await db.sessions.find(sha(token)) : null;
    if (session && session.expires_at > Date.now()) req.user = { id: session.user_id, username: session.username, email: session.email || null,
      language: session.language || 'de', isAdmin: Boolean(session.email_verified) && isEmailAdmin(session.email) };
    next();
  } catch (error) { next(error); }
};
const limit = (kind: string, maximum: number) => (req: Request, res: Response, next: NextFunction) => {
  const key = `social:${kind}:${req.user.id}`;
  if (tooManyAttempts(key, maximum)) return res.status(429).json({ error: 'Zu viele Aktionen. Bitte später erneut versuchen.' });
  noteAttempt(key, maximum);next();
};
async function postOrFail(postId: number, req: Request) { const post = await db.social.post(postId);if (!post || (!post.is_public && !req.user)) throw new AppError('Beitrag nicht gefunden.', 404);return post; }
async function author(userId: number): Promise<SocialAuthor> {
  const user = await db.users.findById(userId);
  return { id: userId, username: user?.username || 'Gelöschter Nutzer', avatarUrl: user?.avatar_file ? `api/social/authors/${userId}/avatar` : null };
}
async function postView(post: SocialPost, req: Request) {
  return { id: post.id, text: post.text, width: post.width, height: post.height, is_public: Boolean(post.is_public), created_at: post.created_at,
    author: await author(post.user_id), imageUrl: `api/social/posts/${post.id}/image`,
    ...await db.social.counts(post.id, req.user?.id), canDelete: Boolean(req.user && (req.user.id === post.user_id || req.user.isAdmin)) };
}
router.get('/posts', viewer, wrap(async (req: Request, res: Response) => {
  const posts = await db.social.posts(before(req), 21, Boolean(req.user)), visible = posts.slice(0, 20);
  res.setHeader('Cache-Control', 'no-store').json({ posts: await Promise.all(visible.map(post => postView(post, req))), next: posts.length > 20 ? visible.at(-1)!.id : null });
}));
router.get('/posts/:id', viewer, wrap(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store').json({ post: await postView(await postOrFail(id(req.params.id), req), req) });
}));
router.get('/posts/:id/image', viewer, wrap(async (req: Request, res: Response) => {
  const post = await postOrFail(id(req.params.id), req), image = getImagePath(post.filename);
  if (!image) throw new AppError('Bild nicht gefunden.', 404);
  res.type('image/webp').setHeader('Cache-Control', 'no-store').sendFile(image);
}));
router.get('/authors/:id/avatar', viewer, wrap(async (req: Request, res: Response) => {
  const userId = id(req.params.id);
  if (!await db.social.hasActivity(userId, Boolean(req.user))) throw new AppError('Profilbild nicht öffentlich verfügbar.', 404);
  const user = await db.users.findById(userId), image = getImagePath(user?.avatar_file);
  if (!image) throw new AppError('Profilbild nicht gefunden.', 404);
  res.type(getMimeType(user?.avatar_file)).setHeader('Cache-Control', 'no-store').sendFile(image);
}));
const requireTerms: RequestHandler = async (req, res, next) => {
  try {
    const user = await db.users.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden.' });
    if (user.terms_version !== TERMS_VERSION || !user.terms_accepted_at)
      return res.status(428).json({ error: 'Bitte zuerst den aktuellen AGB zustimmen.' });
    next();
  } catch (error) { next(error); }
};
router.post('/posts', auth, requireTerms, limit('post', 20), wrap(async (req: Request, res: Response) => {
  const caption = text(req.body.text, 2200);
  if (req.body.isPublic !== undefined && typeof req.body.isPublic !== 'boolean') throw new AppError('Ungültige Sichtbarkeit.', 400);
  const user = await db.users.findById(req.user.id);
  if (!user) throw new AppError('Benutzer nicht gefunden.', 401);
  const image = await saveSocialImage(req.body.image);
  try {
    if (!await db.users.findById(req.user.id)) throw new AppError('Benutzerkonto wurde gelöscht.', 401);
    const postId = await db.social.createPost({ user_id: req.user.id, ...image, is_public: req.body.isPublic === true, text: caption, created_at: new Date().toISOString() });
    if (!await db.users.findById(req.user.id)) { await db.social.deletePost(postId);throw new AppError('Benutzerkonto wurde gelöscht.', 401); }
    res.status(201).json({ post: await postView(await postOrFail(postId, req), req) });
  } catch (error) { deleteImage(image.filename);throw error; }
}));
router.delete('/posts/:id', auth, wrap(async (req: Request, res: Response) => {
  const post = await postOrFail(id(req.params.id), req);
  if (post.user_id !== req.user.id && !req.user.isAdmin) throw new AppError('Keine Löschberechtigung.', 403);
  deleteImage(post.filename, true);await db.social.deletePost(post.id);res.json({ ok: true });
}));
router.put('/posts/:id/like', auth, requireTerms, limit('like', 200), wrap(async (req: Request, res: Response) => {
  const postId = id(req.params.id);await postOrFail(postId, req);
  if (typeof req.body.liked !== 'boolean') throw new AppError('Ungültige Like-Einstellung.', 400);
  await db.social.like(postId, req.user.id, req.body.liked);
  if (!await db.social.post(postId)) { await db.social.like(postId, req.user.id, false);throw new AppError('Beitrag nicht gefunden.', 404); }
  res.json(await db.social.counts(postId, req.user.id));
}));
router.get('/posts/:id/comments', viewer, wrap(async (req: Request, res: Response) => {
  const postId = id(req.params.id);await postOrFail(postId, req);
  const comments = await db.social.comments(postId, before(req), 21), visible = comments.slice(0, 20);
  res.setHeader('Cache-Control', 'no-store').json({ comments: await Promise.all(visible.reverse().map(async comment => ({
    id: comment.id, post_id: comment.post_id, text: comment.text, created_at: comment.created_at, author: await author(comment.user_id),
    canDelete: Boolean(req.user && (req.user.id === comment.user_id || req.user.isAdmin)),
  }))), next: comments.length > 20 ? comments[19].id : null });
}));
router.post('/posts/:id/comments', auth, requireTerms, limit('comment', 60), wrap(async (req: Request, res: Response) => {
  const postId = id(req.params.id);await postOrFail(postId, req);
  const commentId = await db.social.createComment({ post_id: postId, user_id: req.user.id, text: text(req.body.text, 1000, true), created_at: new Date().toISOString() });
  if (!await db.social.post(postId)) { await db.social.deleteComment(commentId);throw new AppError('Beitrag nicht gefunden.', 404); }
  const comment = await db.social.comment(commentId);
  res.status(201).json({ comment: { id: commentId, post_id: postId, text: comment!.text, created_at: comment!.created_at, author: await author(req.user.id), canDelete: true } });
}));
router.delete('/comments/:id', auth, wrap(async (req: Request, res: Response) => {
  const comment = await db.social.comment(id(req.params.id));if (!comment) throw new AppError('Kommentar nicht gefunden.', 404);
  if (comment.user_id !== req.user.id && !req.user.isAdmin) throw new AppError('Keine Löschberechtigung.', 403);
  await db.social.deleteComment(comment.id);res.json({ ok: true });
}));
export = router;
