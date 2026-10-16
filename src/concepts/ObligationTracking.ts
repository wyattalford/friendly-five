import { MongoServerError, type Collection, type Db } from 'mongodb';
import { EvidenceImageInvalid, normalizedEvidenceImage } from '../evidenceImage.ts';

export { EvidenceImageInvalid } from '../evidenceImage.ts';

export class ObligationAlreadyExists extends Error {}
export class ObligationSamePerson extends Error {}
export class ObligationInvalidDescription extends Error {}
export class CompletionNotOpen extends Error {}
export class CompletionNotOwing extends Error {}
export class CompletionInvalidEvidence extends Error {}
export class ReceiptNotCurrent extends Error {}
export class ReceiptNotRecipient extends Error {}
export class ReceiptDisputeNotCurrent extends Error {}
export class ReceiptDisputeNotRecipient extends Error {}
export class ReceiptDisputeEvidenceRequired extends Error {}

type Status = 'DUE' | 'REPORTED' | 'DISPUTED' | 'COMPLETE';

type ObligationDocument = {
    _id: string;
    item: string;
    owing: string;
    recipient: string;
    description: string;
    status: Status;
    currentReport?: string;
    confirmedAt?: Date;
};

type CompletionDocument = {
    _id: string;
    obligation: string;
    evidence?: string;
    evidenceImage?: string;
    evidenceImageName?: string;
    reportedAt: Date;
    disputeEvidence?: string;
    disputeImage?: string;
    disputeImageName?: string;
};

function ensureIndexes(
    obligations: Collection<ObligationDocument>,
    reports: Collection<CompletionDocument>,
): Promise<void> {
    return Promise.all([
        obligations.createIndex({ item: 1 }, { unique: true }),
        reports.createIndex({ obligation: 1, reportedAt: 1 }),
    ]).then(() => undefined);
}

export class ObligationTrackingConcept {
    private readonly obligations: Collection<ObligationDocument>;
    private readonly reports: Collection<CompletionDocument>;

    constructor(db: Db) {
        this.obligations = db.collection<ObligationDocument>(
            'obligationTracking.obligations',
        );
        this.reports = db.collection<CompletionDocument>(
            'obligationTracking.reports',
        );
    }

    async record({
        item,
        owing,
        recipient,
        description,
    }: {
        item: string;
        owing: string;
        recipient: string;
        description: string;
    }) {
        if (await this.obligations.findOne({ item }))
            throw new ObligationAlreadyExists(
                'This item already has an obligation.',
            );
        if (owing === recipient)
            throw new ObligationSamePerson(
                'The owing and receiving people must be different.',
            );
        if (description.trim() === '')
            throw new ObligationInvalidDescription(
                'An obligation description is required.',
            );
        await ensureIndexes(this.obligations, this.reports);
        const obligation = crypto.randomUUID();
        try {
            await this.obligations.insertOne({
                _id: obligation,
                item,
                owing,
                recipient,
                description,
                status: 'DUE',
            });
        } catch (error) {
            if (error instanceof MongoServerError && error.code === 11_000)
                throw new ObligationAlreadyExists(
                    'This item already has an obligation.',
                );
            throw error;
        }
        return { obligation };
    }

    async reportCompletion({
        user,
        obligation: obligationId,
        evidence,
        evidenceImage,
        evidenceImageName,
    }: {
        user: string;
        obligation: string;
        evidence?: string | null;
        evidenceImage?: string | null;
        evidenceImageName?: string | null;
    }) {
        const record = await this.obligations.findOne({ _id: obligationId });
        if (
            record === null ||
            (record.status !== 'DUE' && record.status !== 'DISPUTED')
        )
            throw new CompletionNotOpen(
                'This obligation is not open for a completion report.',
            );
        if (user !== record.owing)
            throw new CompletionNotOwing(
                'Only the owing person can report completion.',
            );
        const suppliedEvidence = evidence === null ? undefined : evidence;
        if (suppliedEvidence !== undefined && suppliedEvidence.trim() === '')
            throw new CompletionInvalidEvidence(
                'Evidence cannot be blank when supplied.',
            );
        const image = normalizedEvidenceImage(evidenceImage, evidenceImageName);
        await ensureIndexes(this.obligations, this.reports);
        const report = crypto.randomUUID();
        await this.reports.insertOne({
            _id: report,
            obligation: obligationId,
            ...(suppliedEvidence === undefined
                ? {}
                : { evidence: suppliedEvidence }),
            ...(image.image === undefined
                ? {}
                : {
                      evidenceImage: image.image,
                      evidenceImageName: image.imageName,
                  }),
            reportedAt: new Date(),
        });
        await this.obligations.updateOne(
            { _id: obligationId, status: { $in: ['DUE', 'DISPUTED'] } },
            { $set: { currentReport: report, status: 'REPORTED' } },
        );
        return { report };
    }

    async confirmReceipt({
        user,
        obligation: obligationId,
        report,
    }: {
        user: string;
        obligation: string;
        report: string;
    }) {
        const record = await this.obligations.findOne({ _id: obligationId });
        if (
            record === null ||
            record.status !== 'REPORTED' ||
            record.currentReport !== report
        )
            throw new ReceiptNotCurrent(
                'Only the current completion report can be confirmed.',
            );
        if (user !== record.recipient)
            throw new ReceiptNotRecipient(
                'Only the recipient can confirm receipt.',
            );
        await this.obligations.updateOne(
            { _id: obligationId, status: 'REPORTED', currentReport: report },
            { $set: { status: 'COMPLETE', confirmedAt: new Date() } },
        );
        return {};
    }

    async disputeReceipt({
        user,
        obligation: obligationId,
        report,
        evidence,
        evidenceImage,
        evidenceImageName,
    }: {
        user: string;
        obligation: string;
        report: string;
        evidence: string;
        evidenceImage?: string | null;
        evidenceImageName?: string | null;
    }) {
        const record = await this.obligations.findOne({ _id: obligationId });
        if (
            record === null ||
            record.status !== 'REPORTED' ||
            record.currentReport !== report
        )
            throw new ReceiptDisputeNotCurrent(
                'Only the current completion report can be disputed.',
            );
        if (user !== record.recipient)
            throw new ReceiptDisputeNotRecipient(
                'Only the recipient can dispute completion.',
            );
        if (evidence.trim() === '')
            throw new ReceiptDisputeEvidenceRequired(
                'A completion dispute needs an explanation or supporting evidence.',
            );
        const image = normalizedEvidenceImage(evidenceImage, evidenceImageName);
        await this.reports.updateOne(
            { _id: report },
            {
                $set: {
                    disputeEvidence: evidence,
                    ...(image.image === undefined
                        ? {}
                        : {
                              disputeImage: image.image,
                              disputeImageName: image.imageName,
                          }),
                },
            },
        );
        await this.obligations.updateOne(
            { _id: obligationId, status: 'REPORTED', currentReport: report },
            { $set: { status: 'DISPUTED' } },
        );
        return {};
    }

    async _byItem({ item }: { item: string }) {
        const record = await this.obligations.findOne({ item });
        return record === null ? [] : [{ obligation: record._id }];
    }

    async _canView({
        obligation: obligationId,
        user,
    }: {
        obligation: string;
        user: string;
    }) {
        const record = await this.obligations.findOne({
            _id: obligationId,
            $or: [{ owing: user }, { recipient: user }],
        });
        return record === null ? [] : [{ obligation: record._id }];
    }

    async _get({ obligation: obligationId }: { obligation: string }) {
        const record = await this.obligations.findOne({ _id: obligationId });
        if (record === null) return [];
        return [
            {
                item: record.item,
                owing: record.owing,
                recipient: record.recipient,
                description: record.description,
                status: record.status,
                ...(record.currentReport === undefined
                    ? {}
                    : { currentReport: record.currentReport }),
                ...(record.confirmedAt === undefined
                    ? {}
                    : { confirmedAt: record.confirmedAt }),
            },
        ];
    }

    async _current({ obligation: obligationId }: { obligation: string }) {
        const obligation = await this.obligations.findOne({ _id: obligationId });
        if (obligation?.currentReport === undefined) return [];
        const report = await this.reports.findOne({ _id: obligation.currentReport });
        if (report === null) return [];
        return [
            {
                report: report._id,
                ...(report.evidence === undefined
                    ? {}
                    : { evidence: report.evidence }),
                reportedAt: report.reportedAt,
                ...(report.disputeEvidence === undefined
                    ? {}
                    : { disputeEvidence: report.disputeEvidence }),
            },
        ];
    }

    async _hasEvidence({ report }: { report: string }) {
        const record = await this.reports.findOne({
            _id: report,
            evidence: { $exists: true, $ne: '' },
        });
        return record === null ? [] : [{ report: record._id }];
    }

    async _images({ obligation: obligationId }: { obligation: string }) {
        const reports = await this.reports
            .find({
                obligation: obligationId,
                $or: [
                    { evidenceImage: { $exists: true } },
                    { disputeImage: { $exists: true } },
                ],
            })
            .sort({ reportedAt: 1, _id: 1 })
            .toArray();
        return reports.map((report) => ({
            report: report._id,
            ...(report.evidenceImage === undefined
                ? {}
                : {
                      evidenceImage: report.evidenceImage,
                      evidenceImageName: report.evidenceImageName,
                  }),
            ...(report.disputeImage === undefined
                ? {}
                : {
                      disputeImage: report.disputeImage,
                      disputeImageName: report.disputeImageName,
                  }),
        }));
    }
}
