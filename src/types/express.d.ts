import type { Aquarium, AccessRole, SessionUser } from './domain';
declare global {
  namespace Express {
    interface Request {
      /** Set by auth middleware before protected handlers run. */
      user: SessionUser;
      /** Set by requireAquariumAccess before aquarium handlers run. */
      aq: Aquarium;
      accessRole: AccessRole;
    }
  }
}
export {};
