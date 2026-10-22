import { MongoServerError, type Collection, type Db } from "mongodb";

export class InvalidCredentials extends Error {}
export class UsernameTaken extends Error {}
export class EmailTaken extends Error {}
export class ReservationNotAvailable extends Error {}
export class ActivationNotAvailable extends Error {}
export class UnknownSession extends Error {}

type UserDocument = {
  _id: string;
  username?: string;
  email?: string;
  passwordVerifier?: string;
};

type SessionDocument = {
  _id: string;
  user: string;
  expiresAt: Date;
};

const SESSION_LIFETIME_MS = 30 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function ensureUserIndexes(users: Collection<UserDocument>): Promise<void> {
  await users.createIndex(
    { username: 1 },
    {
      name: "authenticating_unique_username",
      unique: true,
      partialFilterExpression: { username: { $type: "string" } },
    },
  );
  await users.createIndex(
    { email: 1 },
    {
      name: "authenticating_unique_email",
      unique: true,
      partialFilterExpression: { email: { $type: "string" } },
    },
  );
}

const userIndexPromises = new WeakMap<Collection<UserDocument>, Promise<void>>();

function ensureUserIndexesOnce(users: Collection<UserDocument>): Promise<void> {
  let ready = userIndexPromises.get(users);
  if (ready === undefined) {
    ready = ensureUserIndexes(users);
    userIndexPromises.set(users, ready);
  }
  return ready;
}

export class AuthenticatingConcept {
  private readonly users: Collection<UserDocument>;
  private readonly sessions: Collection<SessionDocument>;

  constructor(
    db: Db,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.users = db.collection<UserDocument>("authenticating.users");
    this.sessions = db.collection<SessionDocument>("authenticating.sessions");
  }

  async register({ username, email, password }: { username: string; email: string; password: string }) {
    const normalizedEmail = normalizeEmail(email);
    if (
      username.trim() === "" ||
      validEmail(normalizeEmail(username)) ||
      password.trim() === "" ||
      !validEmail(normalizedEmail)
    ) {
      throw new InvalidCredentials("A username, valid email, and password are required.");
    }

    await ensureUserIndexesOnce(this.users);
    const user = crypto.randomUUID();
    const passwordVerifier = await Bun.password.hash(password, { algorithm: "argon2id" });

    try {
      await this.users.insertOne({ _id: user, username, email: normalizedEmail, passwordVerifier });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        if (error.keyPattern?.email === 1) throw new EmailTaken("That email is already registered or invited.");
        throw new UsernameTaken("That username is already registered.");
      }
      throw error;
    }

    return { user };
  }

  async reserve({ email }: { email: string }) {
    const normalizedEmail = normalizeEmail(email);
    if (!validEmail(normalizedEmail)) {
      throw new ReservationNotAvailable("A valid invited email is required.");
    }
    await ensureUserIndexesOnce(this.users);
    const user = crypto.randomUUID();
    try {
      await this.users.insertOne({ _id: user, email: normalizedEmail });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        throw new ReservationNotAvailable("That email is already registered or invited.");
      }
      throw error;
    }
    return { user };
  }

  async invite({ identifier }: { identifier: string }) {
    const email = normalizeEmail(identifier);
    const byEmail = validEmail(email);
    const account = await this.users.findOne(byEmail ? { email } : { username: identifier });
    if (account?.passwordVerifier !== undefined) return { user: account._id };
    if (account !== null) throw new ReservationNotAvailable("That email is already registered or invited.");
    if (!byEmail) throw new InvalidCredentials("Use an existing username or a valid email to invite someone.");
    await ensureUserIndexesOnce(this.users);
    const user = crypto.randomUUID();
    try {
      await this.users.insertOne({ _id: user, email });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000)
        throw new ReservationNotAvailable("That email is already registered or invited.");
      throw error;
    }
    return { user };
  }

  async activate({ user, username, password }: { user: string; username: string; password: string }) {
    if (username.trim() === "" || validEmail(normalizeEmail(username)) || password.trim() === "") {
      throw new InvalidCredentials("A username and password are required.");
    }
    await ensureUserIndexesOnce(this.users);
    const reserved = await this.users.findOne({ _id: user, passwordVerifier: { $exists: false } });
    if (reserved === null) {
      throw new ActivationNotAvailable("This invited account cannot be activated.");
    }
    const passwordVerifier = await Bun.password.hash(password, { algorithm: "argon2id" });
    let result;
    try {
      result = await this.users.updateOne(
        { _id: user, passwordVerifier: { $exists: false } },
        { $set: { username, passwordVerifier } },
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        throw new UsernameTaken("That username is already registered.");
      }
      throw error;
    }
    if (result.modifiedCount !== 1) {
      throw new ActivationNotAvailable("This invited account cannot be activated.");
    }
    return {};
  }

  async release({ user }: { user: string }) {
    const result = await this.users.deleteOne({ _id: user, passwordVerifier: { $exists: false } });
    if (result.deletedCount !== 1) {
      throw new ReservationNotAvailable("This invited identity is not reserved.");
    }
    return {};
  }

  async signIn({ username, password }: { username: string; password: string }) {
    const account = await this.users.findOne({ username, email: { $type: "string" } });
    if (account?.passwordVerifier === undefined || !(await Bun.password.verify(password, account.passwordVerifier))) {
      throw new InvalidCredentials("The username or password is incorrect.");
    }

    const now = this.clock();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    await this.sessions.deleteMany({ expiresAt: { $lte: now } });
    const session = crypto.randomUUID();
    await this.sessions.insertOne({ _id: session, user: account._id, expiresAt });
    return { session, expiresAt };
  }

  async authenticate({ session }: { session: string }) {
    const active = await this.sessions.findOne({ _id: session });
    if (active === null) throw new UnknownSession("This session is not active.");
    if (active.expiresAt.getTime() <= this.clock().getTime()) {
      await this.sessions.deleteOne({ _id: session });
      throw new UnknownSession("This session is not active.");
    }
    return { user: active.user };
  }

  async signOut({ session }: { session: string }) {
    const active = await this.sessions.findOne({ _id: session });
    if (active === null) throw new UnknownSession("This session is not active.");
    await this.sessions.deleteOne({ _id: session });
    if (active.expiresAt.getTime() <= this.clock().getTime()) {
      throw new UnknownSession("This session is not active.");
    }
    return {};
  }

  async _byUsername({ username }: { username: string }) {
    const account = await this.users.findOne({ username, passwordVerifier: { $exists: true } });
    return account === null ? [] : [{ user: account._id }];
  }

  async _byEmail({ email }: { email: string }) {
    const account = await this.users.findOne({
      email: normalizeEmail(email),
      passwordVerifier: { $exists: true },
    });
    return account === null ? [] : [{ user: account._id }];
  }

  async _byIdentifier({ identifier }: { identifier: string }) {
    const normalizedEmail = normalizeEmail(identifier);
    const account = await this.users.findOne(
      validEmail(normalizedEmail)
        ? { email: normalizedEmail, passwordVerifier: { $exists: true } }
        : { username: identifier, passwordVerifier: { $exists: true } },
    );
    return account === null ? [] : [{ user: account._id }];
  }

  async _reservedByEmail({ email }: { email: string }) {
    const account = await this.users.findOne({ email: normalizeEmail(email), passwordVerifier: { $exists: false } });
    return account === null ? [] : [{ user: account._id }];
  }

  async _availableEmail({ email }: { email: string }) {
    const normalized = normalizeEmail(email);
    if (!validEmail(normalized) || await this.users.findOne({ email: normalized })) return [];
    return [{ availability: "AVAILABLE" as const }];
  }

  async _reserved({ user }: { user: string }) {
    const account = await this.users.findOne({ _id: user, passwordVerifier: { $exists: false } });
    return account === null ? [] : [{ user: account._id }];
  }

  async _username({ user }: { user: string }) {
    const account = await this.users.findOne({ _id: user, username: { $type: "string" } });
    return account?.username === undefined ? [] : [{ username: account.username }];
  }

  async _email({ user }: { user: string }) {
    const account = await this.users.findOne({ _id: user, email: { $type: "string" } });
    return account?.email === undefined ? [] : [{ email: account.email }];
  }

  async _label({ user }: { user: string }) {
    const account = await this.users.findOne({ _id: user });
    const label = account?.username ?? account?.email;
    return label === undefined ? [] : [{ label }];
  }
}
