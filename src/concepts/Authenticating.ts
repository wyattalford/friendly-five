import { MongoServerError, type Collection, type Db } from "mongodb";

export class InvalidCredentials extends Error {}
export class UsernameTaken extends Error {}
export class UnknownSession extends Error {}

type UserDocument = {
  _id: string;
  username: string;
  passwordVerifier: string;
};

type SessionDocument = {
  _id: string;
  user: string;
};

async function ensureUsernameIndex(users: Collection<UserDocument>): Promise<void> {
  await users.createIndex({ username: 1 }, { unique: true });
}

export class AuthenticatingConcept {
  private readonly users: Collection<UserDocument>;
  private readonly sessions: Collection<SessionDocument>;

  constructor(db: Db) {
    this.users = db.collection<UserDocument>("authenticating.users");
    this.sessions = db.collection<SessionDocument>("authenticating.sessions");
  }

  async register({ username, password }: { username: string; password: string }) {
    if (username.trim() === "" || password.trim() === "") {
      throw new InvalidCredentials("A username and password are required.");
    }

    await ensureUsernameIndex(this.users);
    const user = crypto.randomUUID();
    const passwordVerifier = await Bun.password.hash(password, { algorithm: "argon2id" });

    try {
      await this.users.insertOne({ _id: user, username, passwordVerifier });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        throw new UsernameTaken("That username is already registered.");
      }
      throw error;
    }

    return { user };
  }

  async signIn({ username, password }: { username: string; password: string }) {
    const account = await this.users.findOne({ username });
    if (account === null || !(await Bun.password.verify(password, account.passwordVerifier))) {
      throw new InvalidCredentials("The username or password is incorrect.");
    }

    const session = crypto.randomUUID();
    await this.sessions.insertOne({ _id: session, user: account._id });
    return { session };
  }

  async authenticate({ session }: { session: string }) {
    const active = await this.sessions.findOne({ _id: session });
    if (active === null) throw new UnknownSession("This session is not active.");
    return { user: active.user };
  }

  async signOut({ session }: { session: string }) {
    const result = await this.sessions.deleteOne({ _id: session });
    if (result.deletedCount === 0) throw new UnknownSession("This session is not active.");
    return {};
  }

  async _byUsername({ username }: { username: string }) {
    const account = await this.users.findOne({ username });
    return account === null ? [] : [{ user: account._id }];
  }
}
