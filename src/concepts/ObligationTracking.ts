import { MongoServerError, type Collection, type Db } from 'mongodb';

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
    reportedAt: Date;
    disputeEvidence?: string;
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
    }: {
        user: string;
        obligation: string;
        evidence?: string | null;
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
        await ensureIndexes(this.obligations, this.reports);
        const report = crypto.randomUUID();
        await this.reports.insertOne({
            _id: report,
            obligation: obligationId,
            ...(suppliedEvidence === undefined
                ? {}
                : { evidence: suppliedEvidence }),
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
    }: {
        user: string;
        obligation: string;
        report: string;
        evidence: string;
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
        await this.reports.updateOne(
            { _id: report },
            { $set: { disputeEvidence: evidence } },
        );
        await this.obligations.updateOne(
            { _id: obligationId, status: 'REPORTED', currentReport: report },
            { $set: { status: 'DISPUTED' } },
        );
        return {};
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
}
