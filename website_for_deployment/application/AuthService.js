/**
 * Application: Auth service — single entry point for user, session, and avatar access.
 * Uses UserRepository, SessionRepository, AvatarRepository. No DB or HTTP here.
 */

class AuthService {
    constructor(repos) {
        this.userRepo = repos.userRepo;
        this.sessionRepo = repos.sessionRepo;
        this.avatarRepo = repos.avatarRepo;
    }

    async findUserByEmail(email) {
        return this.userRepo.findByEmail(email);
    }

    async findUserById(userId) {
        return this.userRepo.findById(userId);
    }

    async createUser(user) {
        return this.userRepo.create(user);
    }

    async updateUser(user) {
        return this.userRepo.update(user);
    }

    async createSession(token, sessionData) {
        return this.sessionRepo.create(token, sessionData);
    }

    async findSession(token) {
        return this.sessionRepo.findByToken(token);
    }

    async deleteSession(token) {
        return this.sessionRepo.delete(token);
    }

    async upsertAvatar(userId, avatarData) {
        return this.avatarRepo.upsert(userId, avatarData);
    }

    async findAvatar(userId) {
        return this.avatarRepo.findByUserId(userId);
    }

    async getUserCount() {
        return this.userRepo.getCount();
    }

    async getSessionCount() {
        return this.sessionRepo.getActiveCount();
    }

    async incrementSearchCount(userId) {
        return this.userRepo.incrementSearchCount(userId);
    }

    /**
     * Validate session token from request. Returns { session, user, token } or null.
     */
    async authenticateRequest(req) {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return null;
        const session = await this.findSession(token);
        if (!session) return null;
        if (new Date(session.expiresAt) < new Date()) {
            await this.deleteSession(token);
            return null;
        }
        const user = await this.findUserById(session.userId);
        if (!user) return null;
        return { session, user, token };
    }
}

module.exports = { AuthService };
