import { MongoServerError, type Collection, type Db } from "mongodb";
import { EvidenceImageInvalid, normalizedEvidenceImage } from "../evidenceImage.ts";

export { EvidenceImageInvalid } from "../evidenceImage.ts";

export class CaseAlreadyOpen extends Error {}
export class CaseSameParticipant extends Error {}
export class CaseInvalidRule extends Error {}
export class SubmissionCaseClosed extends Error {}
export class SubmissionNotParticipant extends Error {}
export class SubmissionTooEarly extends Error {}
export class SubmissionInvalidEvidence extends Error {}
export class ConfirmationNotCurrent extends Error {}
export class ConfirmationNotAuthorized extends Error {}
export class DisputeNotCurrent extends Error {}
export class DisputeNotAuthorized extends Error {}
export class DisputeEvidenceRequired extends Error {}
export class DecisionCaseClosed extends Error {}
export class DecisionNotDisputed extends Error {}
export class DecisionNotResolver extends Error {}
export class DecisionTooEarly extends Error {}
export class DecisionEvidenceRequired extends Error {}

type Status = "OPEN" | "PROPOSED" | "DISPUTED" | "FINAL";
type Outcome = "TRUE" | "FALSE" | "VOID";

type CaseDocument = {
  _id: string;
  item: string;
  first: string;
  second: string;
  cutoff: Date;
  resolutionRule: string;
  resolver?: string;
  status: Status;
  currentReport?: string;
  resolvedAt?: Date;
};

type ReportDocument = {
  _id: string;
  case: string;
  author: string;
  outcome: Outcome;
  evidence?: string;
  evidenceImage?: string;
  evidenceImageName?: string;
  reportedAt: Date;
  disputedBy?: string;
  disputeReason?: string;
  disputeImage?: string;
  disputeImageName?: string;
};


function ensureIndexes(cases: Collection<CaseDocument>, reports: Collection<ReportDocument>): Promise<void> {
  return Promise.all([
    cases.createIndex({ item: 1 }, { unique: true }),
    reports.createIndex({ case: 1, reportedAt: 1 }),
  ]).then(() => undefined);
}

function asDate(value: Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export class ResolvingConcept {
  private readonly cases: Collection<CaseDocument>;
  private readonly reports: Collection<ReportDocument>;

  constructor(db: Db) {
    this.cases = db.collection<CaseDocument>("resolving.cases");
    this.reports = db.collection<ReportDocument>("resolving.reports");
  }

  async open({ item, first, second, cutoff, resolutionRule, resolver }: { item: string; first: string; second: string; cutoff: Date; resolutionRule: string; resolver?: string }) {
    if (await this.cases.findOne({ item })) throw new CaseAlreadyOpen("This item already has a resolution case.");
    if (first === second) throw new CaseSameParticipant("The two case participants must be different people.");
    if (resolutionRule.trim() === "") throw new CaseInvalidRule("A resolution rule is required.");
    await ensureIndexes(this.cases, this.reports);
    const resolutionCase = crypto.randomUUID();
    try {
      await this.cases.insertOne({
        _id: resolutionCase,
        item,
        first,
        second,
        cutoff: asDate(cutoff),
        resolutionRule,
        ...(resolver === undefined ? {} : { resolver }),
        status: "OPEN",
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11_000) throw new CaseAlreadyOpen("This item already has a resolution case.");
      throw error;
    }
    return { case: resolutionCase };
  }

  async submit({ user, case: caseId, outcome, evidence, evidenceImage, evidenceImageName }: { user: string; case: string; outcome: Outcome; evidence?: string | null; evidenceImage?: string | null; evidenceImageName?: string | null }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record === null || (record.status !== "OPEN" && record.status !== "DISPUTED")) throw new SubmissionCaseClosed("This case is not open for an outcome report.");
    if (user !== record.first && user !== record.second) throw new SubmissionNotParticipant("Only a case participant can submit an outcome.");
    if (Date.now() < record.cutoff.getTime()) throw new SubmissionTooEarly("The resolution cutoff has not passed.");
    const suppliedEvidence = evidence === null ? undefined : evidence;
    if (suppliedEvidence !== undefined && suppliedEvidence.trim() === "") throw new SubmissionInvalidEvidence("Evidence cannot be blank when supplied.");
    const image = normalizedEvidenceImage(evidenceImage, evidenceImageName);
    await ensureIndexes(this.cases, this.reports);
    const report = crypto.randomUUID();
    await this.reports.insertOne({ _id: report, case: caseId, author: user, outcome, ...(suppliedEvidence === undefined ? {} : { evidence: suppliedEvidence }), ...(image.image === undefined ? {} : { evidenceImage: image.image, evidenceImageName: image.imageName }), reportedAt: new Date() });
    const changed = await this.cases.updateOne({ _id: caseId, status: record.status, currentReport: record.currentReport ?? { $exists: false } }, { $set: { currentReport: report, status: "PROPOSED" } });
    if (changed.modifiedCount !== 1) {
      await this.reports.deleteOne({ _id: report });
      throw new SubmissionCaseClosed("This case is not open for an outcome report.");
    }
    return { report };
  }

  async confirm({ user, case: caseId, report }: { user: string; case: string; report: string }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record === null || record.status !== "PROPOSED" || record.currentReport !== report) throw new ConfirmationNotCurrent("Only the current proposed report can be confirmed.");
    const current = await this.reports.findOne({ _id: report });
    if (current === null || (user !== record.first && user !== record.second) || user === current.author) throw new ConfirmationNotAuthorized("Only the other participant can confirm this report.");
    const changed = await this.cases.updateOne({ _id: caseId, status: "PROPOSED", currentReport: report }, { $set: { status: "FINAL", resolvedAt: new Date() } });
    if (changed.modifiedCount !== 1) throw new ConfirmationNotCurrent("Only the current proposed report can be confirmed.");
    return {};
  }

  async dispute({ user, case: caseId, report, reason, evidenceImage, evidenceImageName }: { user: string; case: string; report: string; reason: string; evidenceImage?: string | null; evidenceImageName?: string | null }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record === null || record.status !== "PROPOSED" || record.currentReport !== report) throw new DisputeNotCurrent("Only the current proposed report can be disputed.");
    const current = await this.reports.findOne({ _id: report });
    if (current === null || (user !== record.first && user !== record.second) || user === current.author) throw new DisputeNotAuthorized("Only the other participant can dispute this report.");
    if (reason.trim() === "") throw new DisputeEvidenceRequired("A dispute needs an explanation or supporting evidence.");
    const image = normalizedEvidenceImage(evidenceImage, evidenceImageName);
    const changed = await this.cases.updateOne({ _id: caseId, status: "PROPOSED", currentReport: report }, { $set: { status: "DISPUTED" } });
    if (changed.modifiedCount !== 1) throw new DisputeNotCurrent("Only the current proposed report can be disputed.");
    await this.reports.updateOne({ _id: report }, { $set: { disputedBy: user, disputeReason: reason, ...(image.image === undefined ? {} : { disputeImage: image.image, disputeImageName: image.imageName }) } });
    return {};
  }

  async decide({ user, case: caseId, outcome, evidence, evidenceImage, evidenceImageName }: { user: string; case: string; outcome: Outcome; evidence: string; evidenceImage?: string | null; evidenceImageName?: string | null }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record === null || record.status === "FINAL") throw new DecisionCaseClosed("This case is already final or does not exist.");
    if (record.status !== "DISPUTED") throw new DecisionNotDisputed("A resolver can decide only after a participant disputes the current report.");
    if (record.resolver === undefined || user !== record.resolver) throw new DecisionNotResolver("Only the designated resolver can decide this case.");
    if (Date.now() < record.cutoff.getTime()) throw new DecisionTooEarly("The resolution cutoff has not passed.");
    if (evidence.trim() === "") throw new DecisionEvidenceRequired("A resolver decision needs supporting evidence or an explanation.");
    const image = normalizedEvidenceImage(evidenceImage, evidenceImageName);
    await ensureIndexes(this.cases, this.reports);
    const report = crypto.randomUUID();
    await this.reports.insertOne({ _id: report, case: caseId, author: user, outcome, evidence, ...(image.image === undefined ? {} : { evidenceImage: image.image, evidenceImageName: image.imageName }), reportedAt: new Date() });
    const changed = await this.cases.updateOne({ _id: caseId, status: "DISPUTED", currentReport: record.currentReport }, { $set: { currentReport: report, status: "FINAL", resolvedAt: new Date() } });
    if (changed.modifiedCount !== 1) {
      await this.reports.deleteOne({ _id: report });
      throw new DecisionCaseClosed("This case is already final or does not exist.");
    }
    return { report };
  }

  async _byItem({ item }: { item: string }) {
    const record = await this.cases.findOne({ item });
    return record === null ? [] : [{ case: record._id }];
  }

  async _canView({ case: caseId, user }: { case: string; user: string }) {
    const record = await this.cases.findOne({
      _id: caseId,
      $or: [{ first: user }, { second: user }, { resolver: user }],
    });
    return record === null ? [] : [{ case: record._id }];
  }

  async _get({ case: caseId }: { case: string }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record === null) return [];
    return [{
      item: record.item,
      first: record.first,
      second: record.second,
      cutoff: record.cutoff,
      resolutionRule: record.resolutionRule,
      ...(record.resolver === undefined ? {} : { resolver: record.resolver }),
      status: record.status,
      ...(record.currentReport === undefined ? {} : { currentReport: record.currentReport }),
      ...(record.resolvedAt === undefined ? {} : { resolvedAt: record.resolvedAt }),
    }];
  }

  async _timing({ case: caseId }: { case: string }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record === null) return [];
    return [{ cutoff: record.cutoff, serverTime: new Date() }];
  }

  async _current({ case: caseId }: { case: string }) {
    const record = await this.cases.findOne({ _id: caseId });
    if (record?.currentReport === undefined) return [];
    const report = await this.reports.findOne({ _id: record.currentReport });
    if (report === null) return [];
    return [{
      report: report._id,
      author: report.author,
      outcome: report.outcome,
      ...(report.evidence === undefined ? {} : { evidence: report.evidence }),
      reportedAt: report.reportedAt,
      ...(report.disputedBy === undefined ? {} : { disputedBy: report.disputedBy }),
      ...(report.disputeReason === undefined ? {} : { disputeReason: report.disputeReason }),
    }];
  }

  async _report({ report }: { report: string }) {
    const record = await this.reports.findOne({ _id: report });
    if (record === null) return [];
    return [{
      case: record.case,
      author: record.author,
      outcome: record.outcome,
      ...(record.evidence === undefined ? {} : { evidence: record.evidence }),
      reportedAt: record.reportedAt,
      ...(record.disputedBy === undefined ? {} : { disputedBy: record.disputedBy }),
      ...(record.disputeReason === undefined ? {} : { disputeReason: record.disputeReason }),
    }];
  }

  async _hasEvidence({ report }: { report: string }) {
    const record = await this.reports.findOne({
      _id: report,
      evidence: { $exists: true, $ne: "" },
    });
    return record === null ? [] : [{ report: record._id }];
  }

  async _images({ case: caseId }: { case: string }) {
    const reports = await this.reports.find({
      case: caseId,
      $or: [
        { evidenceImage: { $exists: true } },
        { disputeImage: { $exists: true } },
      ],
    }).sort({ reportedAt: 1, _id: 1 }).toArray();
    return reports.map((report) => ({
      report: report._id,
      ...(report.evidenceImage === undefined ? {} : {
        evidenceImage: report.evidenceImage,
        evidenceImageName: report.evidenceImageName,
      }),
      ...(report.disputeImage === undefined ? {} : {
        disputeImage: report.disputeImage,
        disputeImageName: report.disputeImageName,
      }),
    }));
  }

  async _reports({ case: caseId }: { case: string }) {
    const reports = await this.reports.find({ case: caseId }).sort({ reportedAt: 1, _id: 1 }).toArray();
    return reports.map((report) => ({
      report: report._id,
      author: report.author,
      outcome: report.outcome,
      ...(report.evidence === undefined ? {} : { evidence: report.evidence }),
      reportedAt: report.reportedAt,
      ...(report.disputedBy === undefined ? {} : { disputedBy: report.disputedBy }),
      ...(report.disputeReason === undefined ? {} : { disputeReason: report.disputeReason }),
    }));
  }
}
