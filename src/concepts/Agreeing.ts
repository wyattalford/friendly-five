import { MongoServerError, type Collection, type Db } from "mongodb";

export class ProposalSameParticipant extends Error {}
export class ProposalInvalidTerms extends Error {}
export class ProposalInvalidDeadline extends Error {}
export class RevisionNotPending extends Error {}
export class RevisionNotParticipant extends Error {}
export class RevisionStaleVersion extends Error {}
export class RevisionExpired extends Error {}
export class RevisionInvalidTerms extends Error {}
export class RevisionInvalidDeadline extends Error {}
export class RevisionUnchanged extends Error {}
export class AcceptanceNotPending extends Error {}
export class AcceptanceStaleVersion extends Error {}
export class AcceptanceNotAuthorized extends Error {}
export class AcceptanceExpired extends Error {}
export class RejectionNotPending extends Error {}
export class RejectionStaleVersion extends Error {}
export class RejectionNotAuthorized extends Error {}
export class WithdrawalNotPending extends Error {}
export class WithdrawalStaleVersion extends Error {}
export class WithdrawalNotAuthorized extends Error {}

type Status = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";

type AgreementDocument = {
  _id: string;
  initiator: string;
  counterpart: string;
  status: Status;
  currentVersion: string;
  acceptedAt?: Date;
};

type VersionDocument = {
  _id: string;
  agreement: string;
  number: number;
  author: string;
  claim: string;
  deadline: Date;
  initiatorStake: string;
  counterpartStake: string;
  exceptions: string;
  resolutionRule: string;
  resolver?: string;
};

type Terms = Omit<VersionDocument, "_id" | "agreement" | "number" | "author">;

function validTerms(claim: string, initiatorStake: string, counterpartStake: string, resolutionRule: string): boolean {
  return [claim, initiatorStake, counterpartStake, resolutionRule].every((value) => value.trim() !== "");
}

function asDate(value: Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function termsDiffer(version: VersionDocument, terms: Terms): boolean {
  return (
    version.claim !== terms.claim ||
    version.deadline.getTime() !== terms.deadline.getTime() ||
    version.initiatorStake !== terms.initiatorStake ||
    version.counterpartStake !== terms.counterpartStake ||
    version.exceptions !== terms.exceptions ||
    version.resolutionRule !== terms.resolutionRule ||
    version.resolver !== terms.resolver
  );
}

async function ensureIndexes(
  agreements: Collection<AgreementDocument>,
  versions: Collection<VersionDocument>,
): Promise<void> {
  await Promise.all([
    versions.createIndex({ agreement: 1, number: 1 }, { unique: true }),
    agreements.createIndex({ initiator: 1 }),
    agreements.createIndex({ counterpart: 1 }),
  ]);
}

export class AgreeingConcept {
  private readonly agreements: Collection<AgreementDocument>;
  private readonly versions: Collection<VersionDocument>;

  constructor(db: Db) {
    this.agreements = db.collection<AgreementDocument>("agreeing.agreements");
    this.versions = db.collection<VersionDocument>("agreeing.versions");
  }

  async propose({
    initiator,
    counterpart,
    claim,
    deadline,
    initiatorStake,
    counterpartStake,
    exceptions,
    resolutionRule,
    resolver,
  }: {
    initiator: string;
    counterpart: string;
    claim: string;
    deadline: Date;
    initiatorStake: string;
    counterpartStake: string;
    exceptions: string;
    resolutionRule: string;
    resolver?: string;
  }) {
    const due = asDate(deadline);
    if (initiator === counterpart) throw new ProposalSameParticipant("The two agreement participants must be different people.");
    if (!validTerms(claim, initiatorStake, counterpartStake, resolutionRule)) {
      throw new ProposalInvalidTerms("A claim, both stakes, and a resolution rule are required.");
    }
    if (due.getTime() <= Date.now() || Number.isNaN(due.getTime())) {
      throw new ProposalInvalidDeadline("The agreement deadline must be in the future.");
    }

    await ensureIndexes(this.agreements, this.versions);
    const agreement = crypto.randomUUID();
    const version = crypto.randomUUID();
    await this.agreements.insertOne({
      _id: agreement,
      initiator,
      counterpart,
      status: "PENDING",
      currentVersion: version,
    });
    try {
      await this.versions.insertOne({
        _id: version,
        agreement,
        number: 1,
        author: initiator,
        claim,
        deadline: due,
        initiatorStake,
        counterpartStake,
        exceptions,
        resolutionRule,
        ...(resolver === undefined ? {} : { resolver }),
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) {
        await this.agreements.deleteOne({ _id: agreement });
      }
      throw error;
    }
    return { agreement, version };
  }

  async revise({
    user,
    agreement,
    expectedVersion,
    claim,
    deadline,
    initiatorStake,
    counterpartStake,
    exceptions,
    resolutionRule,
    resolver,
  }: {
    user: string;
    agreement: string;
    expectedVersion: string;
    claim: string;
    deadline: Date;
    initiatorStake: string;
    counterpartStake: string;
    exceptions: string;
    resolutionRule: string;
    resolver?: string;
  }) {
    const due = asDate(deadline);
    const record = await this.agreements.findOne({ _id: agreement });
    if (record === null || record.status !== "PENDING") throw new RevisionNotPending("Only a pending agreement can be revised.");
    if (user !== record.initiator && user !== record.counterpart) throw new RevisionNotParticipant("Only an agreement participant can revise its terms.");
    if (record.currentVersion !== expectedVersion) throw new RevisionStaleVersion("Those terms are no longer the current version.");
    const current = await this.versions.findOne({ _id: expectedVersion });
    if (current === null) throw new RevisionStaleVersion("Those terms are no longer the current version.");
    if (current.deadline.getTime() <= Date.now()) throw new RevisionExpired("The current version's deadline has passed.");
    if (!validTerms(claim, initiatorStake, counterpartStake, resolutionRule)) throw new RevisionInvalidTerms("A claim, both stakes, and a resolution rule are required.");
    if (due.getTime() <= Date.now() || Number.isNaN(due.getTime())) throw new RevisionInvalidDeadline("The agreement deadline must be in the future.");
    const terms = { claim, deadline: due, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver };
    if (!termsDiffer(current, terms)) throw new RevisionUnchanged("A revision must change at least one term.");

    await ensureIndexes(this.agreements, this.versions);
    const version = crypto.randomUUID();
    await this.versions.insertOne({ _id: version, agreement, number: current.number + 1, author: user, ...terms });
    await this.agreements.updateOne({ _id: agreement, currentVersion: expectedVersion }, { $set: { currentVersion: version } });
    return { version };
  }

  async accept({ user, agreement, version }: { user: string; agreement: string; version: string }) {
    const record = await this.agreements.findOne({ _id: agreement });
    if (record === null || record.status !== "PENDING") throw new AcceptanceNotPending("Only a pending agreement can be accepted.");
    if (record.currentVersion !== version) throw new AcceptanceStaleVersion("Those terms are no longer the current version.");
    const current = await this.versions.findOne({ _id: version });
    if (current === null) throw new AcceptanceStaleVersion("Those terms are no longer the current version.");
    if ((user !== record.initiator && user !== record.counterpart) || user === current.author) throw new AcceptanceNotAuthorized("Only the other participant can accept the current version.");
    if (current.deadline.getTime() <= Date.now()) throw new AcceptanceExpired("The agreement deadline has passed.");
    await this.agreements.updateOne({ _id: agreement, status: "PENDING", currentVersion: version }, { $set: { status: "ACCEPTED", acceptedAt: new Date() } });
    return {};
  }

  async reject({ user, agreement, version }: { user: string; agreement: string; version: string }) {
    const record = await this.agreements.findOne({ _id: agreement });
    if (record === null || record.status !== "PENDING") throw new RejectionNotPending("Only a pending agreement can be rejected.");
    if (record.currentVersion !== version) throw new RejectionStaleVersion("Those terms are no longer the current version.");
    const current = await this.versions.findOne({ _id: version });
    if (current === null || (user !== record.initiator && user !== record.counterpart) || user === current.author) throw new RejectionNotAuthorized("Only the other participant can reject the current version.");
    await this.agreements.updateOne({ _id: agreement, status: "PENDING", currentVersion: version }, { $set: { status: "REJECTED" } });
    return {};
  }

  async withdraw({ user, agreement, version }: { user: string; agreement: string; version: string }) {
    const record = await this.agreements.findOne({ _id: agreement });
    if (record === null || record.status !== "PENDING") throw new WithdrawalNotPending("Only a pending agreement can be withdrawn.");
    if (record.currentVersion !== version) throw new WithdrawalStaleVersion("Those terms are no longer the current version.");
    const current = await this.versions.findOne({ _id: version });
    if (current === null || user !== current.author) throw new WithdrawalNotAuthorized("Only the current version's author can withdraw it.");
    await this.agreements.updateOne({ _id: agreement, status: "PENDING", currentVersion: version }, { $set: { status: "WITHDRAWN" } });
    return {};
  }

  async _get({ agreement }: { agreement: string }) {
    const record = await this.agreements.findOne({ _id: agreement });
    if (record === null) return [];
    return [
      {
        initiator: record.initiator,
        counterpart: record.counterpart,
        status: record.status,
        currentVersion: record.currentVersion,
        ...(record.acceptedAt === undefined ? {} : { acceptedAt: record.acceptedAt }),
      },
    ];
  }

  async _version({ version }: { version: string }) {
    const record = await this.versions.findOne({ _id: version });
    if (record === null) return [];
    return [
      {
        agreement: record.agreement,
        number: record.number,
        author: record.author,
        claim: record.claim,
        deadline: record.deadline,
        initiatorStake: record.initiatorStake,
        counterpartStake: record.counterpartStake,
        exceptions: record.exceptions,
        resolutionRule: record.resolutionRule,
        ...(record.resolver === undefined ? {} : { resolver: record.resolver }),
      },
    ];
  }

  async _designatedResolver({ agreement }: { agreement: string }) {
    const record = await this.agreements.findOne({ _id: agreement });
    if (record === null) return [];
    const version = await this.versions.findOne({ _id: record.currentVersion });
    return version?.resolver === undefined ? [] : [{ resolver: version.resolver }];
  }
}
