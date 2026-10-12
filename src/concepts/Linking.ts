import { MongoServerError, type Collection, type Db } from "mongodb";

export class LinkNotActive extends Error {}
export class LinkNotOwner extends Error {}

type LinkStatus = "ACTIVE" | "REVOKED";

type LinkDocument = {
  _id: string;
  owner: string;
  item: string;
  token: string;
  status: LinkStatus;
};

async function ensureIndexes(links: Collection<LinkDocument>): Promise<void> {
  await Promise.all([
    links.createIndex({ token: 1 }, { unique: true }),
    links.createIndex({ owner: 1 }),
    links.createIndex({ item: 1 }),
  ]);
}

export class LinkingConcept {
  private readonly links: Collection<LinkDocument>;

  constructor(db: Db) {
    this.links = db.collection<LinkDocument>("linking.links");
  }

  async create({ owner, item }: { owner: string; item: string }) {
    await ensureIndexes(this.links);

    for (;;) {
      const link = crypto.randomUUID();
      const token = crypto.randomUUID();
      try {
        await this.links.insertOne({ _id: link, owner, item, token, status: "ACTIVE" });
        return { link, token };
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11_000) throw error;
      }
    }
  }

  async resolve({ token }: { token: string }) {
    const record = await this.links.findOne({ token, status: "ACTIVE" });
    if (record === null) throw new LinkNotActive("That invitation link is not active.");
    return { item: record.item };
  }

  async _activeForItem({ item }: { item: string }) {
    const record = await this.links.findOne(
      { item, status: "ACTIVE" },
      { sort: { _id: 1 } },
    );
    return record === null ? [] : [{ link: record._id, token: record.token }];
  }

  async revoke({ user, link }: { user: string; link: string }) {
    const record = await this.links.findOne({ _id: link });
    if (record === null || record.status !== "ACTIVE") {
      throw new LinkNotActive("That invitation link is not active.");
    }
    if (record.owner !== user) throw new LinkNotOwner("Only the link owner can revoke it.");

    const result = await this.links.updateOne(
      { _id: link, status: "ACTIVE" },
      { $set: { status: "REVOKED" } },
    );
    if (result.modifiedCount !== 1) throw new LinkNotActive("That invitation link is not active.");
    return {};
  }
}
