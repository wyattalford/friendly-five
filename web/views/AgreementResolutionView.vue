<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api.ts";

type Outcome = "TRUE" | "FALSE" | "VOID";
type AgreementResult = Awaited<ReturnType<typeof api.agreements.get>>;
type AgreementDetails = Exclude<AgreementResult, { error: unknown }>;
type ResolutionResult = Awaited<ReturnType<typeof api.resolutions["by-agreement"]>>;
type ResolutionDetails = Exclude<ResolutionResult, { error: unknown }>;
type ReportResult = Awaited<ReturnType<typeof api.resolutions.current>>;
type ReportDetails = Exclude<ReportResult, { error: unknown }>;
type HistoryResult = Awaited<ReturnType<typeof api.resolutions.history>>;
type HistoryDetails = Exclude<HistoryResult, { error: unknown }>;
type HistoryReport = HistoryDetails["history"]["reports"][number];
type ObligationResult = Awaited<ReturnType<typeof api.obligations["by-agreement"]>>;
type ObligationDetails = Exclude<ObligationResult, { error: unknown }>;
type CompletionResult = Awaited<ReturnType<typeof api.obligations.current>>;
type CompletionDetails = Exclude<CompletionResult, { error: unknown }>;

const route = useRoute();
const currentUserId = inject<Readonly<Ref<string>>>("currentUserId");
if (currentUserId === undefined) throw new Error("Resolution view requires authentication context.");

const agreement = ref<AgreementDetails | null>(null);
const resolution = ref<ResolutionDetails | null>(null);
const currentReport = ref<ReportDetails | null>(null);
const reportHistory = ref<HistoryReport[]>([]);
const obligation = ref<ObligationDetails | null>(null);
const currentCompletion = ref<CompletionDetails | null>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref("");
const notice = ref("");
const reportOutcome = ref<Outcome>("TRUE");
const reportEvidence = ref("");
const disputeReason = ref("");
const decisionOutcome = ref<Outcome>("TRUE");
const decisionEvidence = ref("");
const completionEvidence = ref("");
const completionDisputeEvidence = ref("");
const currentTime = ref(Date.now());
let cutoffTimer: ReturnType<typeof setTimeout> | undefined;

const agreementId = computed(() => String(route.params.agreement ?? ""));
const isParticipant = computed(
  () =>
    agreement.value !== null &&
    (agreement.value.initiator === currentUserId.value ||
      agreement.value.counterpart === currentUserId.value),
);
const isResolver = computed(
  () =>
    agreement.value !== null &&
    "resolver" in agreement.value &&
    agreement.value.resolver === currentUserId.value,
);
const cutoffPassed = computed(
  () =>
    resolution.value !== null &&
    currentTime.value >= new Date(resolution.value.cutoff).getTime(),
);
const canSubmitReport = computed(
  () =>
    isParticipant.value &&
    cutoffPassed.value &&
    (resolution.value?.status === "OPEN" || resolution.value?.status === "DISPUTED"),
);
const canReviewReport = computed(
  () =>
    isParticipant.value &&
    resolution.value?.status === "PROPOSED" &&
    currentReport.value !== null &&
    currentReport.value.author !== currentUserId.value,
);
const canDecide = computed(
  () => isResolver.value && resolution.value?.status === "DISPUTED",
);
const isOwing = computed(
  () => obligation.value !== null && obligation.value.owing === currentUserId.value,
);
const isRecipient = computed(
  () => obligation.value !== null && obligation.value.recipient === currentUserId.value,
);
const canReportCompletion = computed(
  () =>
    isOwing.value &&
    (obligation.value?.status === "DUE" || obligation.value?.status === "DISPUTED"),
);
const canReviewCompletion = computed(
  () =>
    isRecipient.value &&
    obligation.value?.status === "REPORTED" &&
    currentCompletion.value !== null,
);

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function outcomeLabel(outcome: Outcome): string {
  if (outcome === "TRUE") return "The claim is true";
  if (outcome === "FALSE") return "The claim is false";
  return "Void with no obligation";
}

function usernameFor(user: string): string {
  if (agreement.value === null) return "Unknown user";
  if (user === agreement.value.initiator) return agreement.value.initiatorUsername;
  if (user === agreement.value.counterpart) return agreement.value.counterpartUsername;
  if ("resolver" in agreement.value && user === agreement.value.resolver) {
    return agreement.value.resolverUsername;
  }
  return "Unknown user";
}

function requestError(code: string): string {
  if (code === "FORBIDDEN") return "You are not authorized to use this resolution case.";
  if (code === "NOT_FOUND") return "The resolution case could not be found.";
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and try again.";
  if (code === "INVALID_REQUEST") return "This action is no longer available. Reloaded details may have changed.";
  if (code === "CONFLICT") return "The resulting obligation was already recorded.";
  if (code === "NETWORK_ERROR") return "FriendlyFive could not reach the server. Try again.";
  return "FriendlyFive could not complete that action. Try again.";
}

function obligationRequestError(code: string): string {
  if (code === "FORBIDDEN") return "You are not authorized to use this obligation.";
  if (code === "NOT_FOUND") return "The obligation could not be found.";
  return requestError(code);
}

function clearCutoffTimer(): void {
  if (cutoffTimer !== undefined) clearTimeout(cutoffTimer);
  cutoffTimer = undefined;
}

function scheduleCutoffUpdate(): void {
  clearCutoffTimer();
  currentTime.value = Date.now();
  if (resolution.value === null) return;

  const remaining = new Date(resolution.value.cutoff).getTime() - currentTime.value;
  if (remaining <= 0) return;
  cutoffTimer = setTimeout(() => {
    currentTime.value = Date.now();
    cutoffTimer = undefined;
  }, remaining + 25);
}

async function loadObligation(): Promise<void> {
  if (
    resolution.value?.status !== "FINAL" ||
    currentReport.value?.outcome === "VOID" ||
    !isParticipant.value
  ) {
    obligation.value = null;
    currentCompletion.value = null;
    return;
  }

  const obligationResult = await api.obligations["by-agreement"]({
    agreement: agreementId.value,
  });
  if ("error" in obligationResult) {
    obligation.value = null;
    currentCompletion.value = null;
    error.value = obligationRequestError(obligationResult.error);
    return;
  }
  obligation.value = obligationResult;

  if (obligationResult.status === "DUE") {
    currentCompletion.value = null;
    return;
  }

  const completionResult = await api.obligations.current({
    obligation: obligationResult.obligation,
  });
  if ("error" in completionResult) {
    currentCompletion.value = null;
    error.value = obligationRequestError(completionResult.error);
    return;
  }
  currentCompletion.value = completionResult;
}

async function loadPage(showLoading = true): Promise<void> {
  if (showLoading) loading.value = true;
  error.value = "";
  try {
    const agreementResult = await api.agreements.get({ agreement: agreementId.value });
    if ("error" in agreementResult) {
      agreement.value = null;
      resolution.value = null;
      currentReport.value = null;
      reportHistory.value = [];
      obligation.value = null;
      currentCompletion.value = null;
      error.value = requestError(agreementResult.error);
      return;
    }
    agreement.value = agreementResult;

    const resolutionResult = await api.resolutions["by-agreement"]({
      agreement: agreementId.value,
    });
    if ("error" in resolutionResult) {
      resolution.value = null;
      currentReport.value = null;
      reportHistory.value = [];
      obligation.value = null;
      currentCompletion.value = null;
      error.value = requestError(resolutionResult.error);
      return;
    }
    resolution.value = resolutionResult;
    scheduleCutoffUpdate();

    const historyResult = await api.resolutions.history({ case: resolutionResult.case });
    if ("error" in historyResult) {
      reportHistory.value = [];
      error.value = requestError(historyResult.error);
      return;
    }
    reportHistory.value = historyResult.history.reports;

    if (resolutionResult.status === "OPEN") {
      currentReport.value = null;
      obligation.value = null;
      currentCompletion.value = null;
      return;
    }

    const reportResult = await api.resolutions.current({ case: resolutionResult.case });
    if ("error" in reportResult) {
      currentReport.value = null;
      error.value = requestError(reportResult.error);
      return;
    }
    currentReport.value = reportResult;
    await loadObligation();
  } catch {
    error.value = "FriendlyFive could not load this resolution case. Try again.";
  } finally {
    loading.value = false;
  }
}

async function submitReport(): Promise<void> {
  if (resolution.value === null) return;
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const evidence = reportEvidence.value.trim();
    const result = await api.resolutions.report({
      case: resolution.value.case,
      outcome: reportOutcome.value,
      ...(evidence === "" ? {} : { evidence }),
    });
    if ("error" in result) {
      error.value = requestError(result.error);
      return;
    }
    reportEvidence.value = "";
    await loadPage(false);
    notice.value = "Outcome submitted. The other participant can now confirm or dispute it.";
  } catch {
    error.value = "FriendlyFive could not submit the outcome. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function confirmReport(): Promise<void> {
  if (resolution.value === null || currentReport.value === null) return;
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.resolutions.confirm({
      case: resolution.value.case,
      report: currentReport.value.report,
    });
    if ("error" in result) {
      error.value = requestError(result.error);
      return;
    }
    await loadPage(false);
    notice.value = "Outcome confirmed. The resolution is final.";
  } catch {
    error.value = "FriendlyFive could not confirm the outcome. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function disputeReport(): Promise<void> {
  if (resolution.value === null || currentReport.value === null) return;
  const reason = disputeReason.value.trim();
  if (reason === "") {
    error.value = "Explain the disagreement or provide supporting evidence.";
    return;
  }

  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.resolutions.dispute({
      case: resolution.value.case,
      report: currentReport.value.report,
      reason,
    });
    if ("error" in result) {
      error.value = requestError(result.error);
      return;
    }
    disputeReason.value = "";
    await loadPage(false);
    notice.value = isResolver.value
      ? "Dispute recorded. You may submit a resolver decision."
      : "Dispute recorded. The designated resolver may now decide, or a participant may submit a revised report.";
  } catch {
    error.value = "FriendlyFive could not record the dispute. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function decideOutcome(): Promise<void> {
  if (resolution.value === null) return;
  const evidence = decisionEvidence.value.trim();
  if (evidence === "") {
    error.value = "Explain the resolver decision or provide supporting evidence.";
    return;
  }

  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.resolutions.decide({
      case: resolution.value.case,
      outcome: decisionOutcome.value,
      evidence,
    });
    if ("error" in result) {
      error.value = requestError(result.error);
      return;
    }
    decisionEvidence.value = "";
    await loadPage(false);
    notice.value = "Resolver decision recorded. The resolution is final.";
  } catch {
    error.value = "FriendlyFive could not record the decision. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function reportCompletion(): Promise<void> {
  if (obligation.value === null) return;
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const evidence = completionEvidence.value.trim();
    const result = await api.obligations.report({
      obligation: obligation.value.obligation,
      ...(evidence === "" ? {} : { evidence }),
    });
    if ("error" in result) {
      error.value = obligationRequestError(result.error);
      return;
    }
    completionEvidence.value = "";
    await loadPage(false);
    notice.value = "Completion reported. The recipient can now confirm or dispute it.";
  } catch {
    error.value = "FriendlyFive could not report completion. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function confirmCompletion(): Promise<void> {
  if (obligation.value === null || currentCompletion.value === null) return;
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.obligations.confirm({
      obligation: obligation.value.obligation,
      report: currentCompletion.value.report,
    });
    if ("error" in result) {
      error.value = obligationRequestError(result.error);
      return;
    }
    await loadPage(false);
    notice.value = "Receipt confirmed. The obligation is complete.";
  } catch {
    error.value = "FriendlyFive could not confirm receipt. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function disputeCompletion(): Promise<void> {
  if (obligation.value === null || currentCompletion.value === null) return;
  const evidence = completionDisputeEvidence.value.trim();
  if (evidence === "") {
    error.value = "Explain why the obligation is not complete.";
    return;
  }

  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.obligations.dispute({
      obligation: obligation.value.obligation,
      report: currentCompletion.value.report,
      evidence,
    });
    if ("error" in result) {
      error.value = obligationRequestError(result.error);
      return;
    }
    completionDisputeEvidence.value = "";
    await loadPage(false);
    notice.value = "Completion disputed. The owing participant can submit a revised report.";
  } catch {
    error.value = "FriendlyFive could not dispute completion. Try again.";
  } finally {
    submitting.value = false;
  }
}

onMounted(loadPage);
onUnmounted(clearCutoffTimer);
watch(agreementId, () => loadPage());
</script>

<template>
  <section class="page-content resolution-page" aria-labelledby="resolution-heading">
    <RouterLink class="back-link" :to="{ name: 'home' }">← Home</RouterLink>

    <div v-if="loading" class="welcome-card content-card">
      <p class="eyebrow">Agreement resolution</p>
      <h1 id="resolution-heading">Loading the outcome…</h1>
    </div>

    <div v-else-if="error && (!agreement || !resolution)" class="welcome-card content-card">
      <p class="eyebrow">Resolution unavailable</p>
      <h1 id="resolution-heading">This case could not be opened.</h1>
      <p class="notice notice-error" role="alert">{{ error }}</p>
    </div>

    <template v-else-if="agreement && resolution">
      <div class="agreement-header">
        <div>
          <p class="eyebrow">Agreement outcome</p>
          <h1 id="resolution-heading">{{ agreement.claim }}</h1>
        </div>
        <span class="status-badge" :class="`status-${resolution.status.toLowerCase()}`">
          {{ resolution.status }}
        </span>
      </div>

      <div class="terms-grid resolution-summary">
        <section class="terms-card">
          <h2>Decision rule</h2>
          <p>{{ resolution.resolutionRule }}</p>
          <dl>
            <div>
              <dt>Reporting cutoff</dt>
              <dd>{{ formatDate(resolution.cutoff) }}</dd>
            </div>
            <div v-if="'resolverUsername' in agreement">
              <dt>Designated resolver</dt>
              <dd>{{ agreement.resolverUsername }}</dd>
            </div>
          </dl>
        </section>

        <section class="terms-card">
          <h2>What the result means</h2>
          <dl>
            <div>
              <dt>True</dt>
              <dd>{{ agreement.counterpartUsername }} owes {{ agreement.counterpartStake }}.</dd>
            </div>
            <div>
              <dt>False</dt>
              <dd>{{ agreement.initiatorUsername }} owes {{ agreement.initiatorStake }}.</dd>
            </div>
            <div>
              <dt>Void</dt>
              <dd>No obligation is recorded.</dd>
            </div>
          </dl>
        </section>
      </div>

      <section v-if="currentReport" class="report-card">
        <p class="eyebrow">{{ resolution.status === "FINAL" ? "Final outcome" : "Current report" }}</p>
        <h2>{{ outcomeLabel(currentReport.outcome) }}</h2>
        <p class="report-meta">
          Reported by {{ usernameFor(currentReport.author) }} on {{ formatDate(currentReport.reportedAt) }}
        </p>
        <div v-if="'evidence' in currentReport" class="evidence-block">
          <strong>Evidence or explanation</strong>
          <p>{{ currentReport.evidence }}</p>
        </div>
        <div v-if="'disputeReason' in currentReport" class="dispute-block">
          <strong>Disputed by {{ usernameFor(currentReport.disputedBy) }}</strong>
          <p>{{ currentReport.disputeReason }}</p>
        </div>
      </section>

      <section v-if="reportHistory.length > 0" class="history-card" aria-labelledby="outcome-history-heading">
        <div class="history-heading">
          <div>
            <p class="eyebrow">Record of changes</p>
            <h2 id="outcome-history-heading">Outcome history</h2>
          </div>
          <span>{{ reportHistory.length }} {{ reportHistory.length === 1 ? "report" : "reports" }}</span>
        </div>
        <ol class="history-list">
          <li v-for="(report, index) in reportHistory" :key="report.report" class="history-entry">
            <div class="history-marker" aria-hidden="true">{{ index + 1 }}</div>
            <div class="history-content">
              <div class="history-entry-heading">
                <h3>{{ outcomeLabel(report.outcome) }}</h3>
                <span v-if="report.report === currentReport?.report" class="current-label">
                  {{ resolution.status === "FINAL" ? "Final" : "Current" }}
                </span>
              </div>
              <p class="report-meta">
                Reported by {{ usernameFor(report.author) }} on {{ formatDate(report.reportedAt) }}
              </p>
              <div v-if="report.evidence" class="evidence-block">
                <strong>Evidence or explanation</strong>
                <p>{{ report.evidence }}</p>
              </div>
              <div v-if="report.disputeReason" class="dispute-block">
                <strong>Disputed by {{ usernameFor(report.disputedBy ?? "") }}</strong>
                <p>{{ report.disputeReason }}</p>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

      <section v-if="resolution.status === 'OPEN' && !cutoffPassed" class="action-card">
        <h2>Reporting has not opened</h2>
        <p>Participants can submit the outcome after {{ formatDate(resolution.cutoff) }}.</p>
      </section>

      <form v-if="canSubmitReport" class="action-card resolution-form" @submit.prevent="submitReport">
        <h2>{{ resolution.status === "DISPUTED" ? "Submit a revised outcome" : "Submit an outcome" }}</h2>
        <p>Evidence is optional for an ordinary participant report.</p>
        <label for="report-outcome">Outcome</label>
        <select id="report-outcome" v-model="reportOutcome" :disabled="submitting">
          <option value="TRUE">The claim is true</option>
          <option value="FALSE">The claim is false</option>
          <option value="VOID">Void the agreement</option>
        </select>
        <label for="report-evidence">Evidence or explanation <span>optional</span></label>
        <textarea id="report-evidence" v-model="reportEvidence" rows="3" :disabled="submitting"></textarea>
        <button class="button button-primary" type="submit" :disabled="submitting">
          {{ submitting ? "Submitting…" : "Submit outcome" }}
        </button>
      </form>

      <section v-if="canReviewReport" class="action-card">
        <h2>Review this report</h2>
        <p>Confirming makes the outcome final. A dispute requires an explanation or supporting evidence.</p>
        <button class="button button-primary" type="button" :disabled="submitting" @click="confirmReport">
          {{ submitting ? "Saving…" : "Confirm outcome" }}
        </button>
        <form class="resolution-form dispute-form" @submit.prevent="disputeReport">
          <label for="dispute-reason">Why do you dispute this outcome?</label>
          <textarea id="dispute-reason" v-model="disputeReason" required rows="3" :disabled="submitting"></textarea>
          <button class="button button-danger" type="submit" :disabled="submitting">
            {{ submitting ? "Saving…" : "Dispute outcome" }}
          </button>
        </form>
      </section>

      <section v-else-if="resolution.status === 'PROPOSED' && currentReport?.author === currentUserId" class="action-card">
        <h2>Waiting for the other participant</h2>
        <p>They can confirm this report or dispute it with an explanation.</p>
      </section>

      <form v-if="canDecide" class="action-card resolution-form resolver-card" @submit.prevent="decideOutcome">
        <p class="eyebrow">Resolver action</p>
        <h2>Decide the disputed outcome</h2>
        <p>Use the accepted decision rule and explain the basis for the final result.</p>
        <label for="decision-outcome">Final outcome</label>
        <select id="decision-outcome" v-model="decisionOutcome" :disabled="submitting">
          <option value="TRUE">The claim is true</option>
          <option value="FALSE">The claim is false</option>
          <option value="VOID">Void the agreement</option>
        </select>
        <label for="decision-evidence">Evidence or explanation</label>
        <textarea id="decision-evidence" v-model="decisionEvidence" required rows="4" :disabled="submitting"></textarea>
        <button class="button button-primary" type="submit" :disabled="submitting">
          {{ submitting ? "Recording decision…" : "Record final decision" }}
        </button>
      </form>

      <section v-if="resolution.status === 'DISPUTED' && !canDecide && !canSubmitReport" class="action-card">
        <h2>Waiting for the resolver</h2>
        <p>The designated resolver can now decide the outcome using the accepted rule.</p>
      </section>

      <section v-if="resolution.status === 'FINAL'" class="action-card final-card">
        <h2>This outcome is final</h2>
        <p v-if="currentReport?.outcome === 'VOID'">No obligation was created.</p>
        <p v-else>The applicable stake has been recorded as an obligation.</p>
      </section>

      <section v-if="obligation" class="obligation-card">
        <div class="obligation-header">
          <div>
            <p class="eyebrow">Settlement</p>
            <h2>{{ usernameFor(obligation.owing) }} owes {{ usernameFor(obligation.recipient) }}</h2>
          </div>
          <span class="status-badge" :class="`status-${obligation.status.toLowerCase()}`">
            {{ obligation.status }}
          </span>
        </div>

        <p class="obligation-description">{{ obligation.description }}</p>
        <p class="field-help">
          FriendlyFive records whether the obligation was completed. The participants handle the stake outside the app.
        </p>

        <div v-if="currentCompletion" class="completion-report">
          <strong>Current completion report</strong>
          <p>Reported on {{ formatDate(currentCompletion.reportedAt) }}</p>
          <div v-if="'evidence' in currentCompletion" class="evidence-block">
            <strong>Evidence or explanation</strong>
            <p>{{ currentCompletion.evidence }}</p>
          </div>
          <div v-if="'disputeEvidence' in currentCompletion" class="dispute-block">
            <strong>Recipient's dispute</strong>
            <p>{{ currentCompletion.disputeEvidence }}</p>
          </div>
        </div>

        <form
          v-if="canReportCompletion"
          class="resolution-form fulfillment-form"
          @submit.prevent="reportCompletion"
        >
          <h3>
            {{ obligation.status === "DISPUTED" ? "Submit a revised completion report" : "Report completion" }}
          </h3>
          <p>
            {{ obligation.status === "DISPUTED"
              ? "Respond to the recipient's concern after completing the obligation."
              : "Report after you have completed the obligation." }}
          </p>
          <label for="completion-evidence">Evidence or explanation <span>optional</span></label>
          <textarea
            id="completion-evidence"
            v-model="completionEvidence"
            rows="3"
            :disabled="submitting"
          ></textarea>
          <button class="button button-primary" type="submit" :disabled="submitting">
            {{ submitting ? "Submitting…" : "Report completion" }}
          </button>
        </form>

        <section v-else-if="obligation.status === 'DUE' && isRecipient" class="fulfillment-state">
          <h3>Waiting for completion</h3>
          <p>{{ usernameFor(obligation.owing) }} can report when the obligation has been completed.</p>
        </section>

        <section v-if="canReviewCompletion" class="fulfillment-state">
          <h3>Review the completion report</h3>
          <p>Confirm if you received the stake. If it is incomplete, explain the problem.</p>
          <button class="button button-primary" type="button" :disabled="submitting" @click="confirmCompletion">
            {{ submitting ? "Saving…" : "Confirm receipt" }}
          </button>
          <form class="resolution-form dispute-form" @submit.prevent="disputeCompletion">
            <label for="completion-dispute-evidence">Why is the obligation not complete?</label>
            <textarea
              id="completion-dispute-evidence"
              v-model="completionDisputeEvidence"
              required
              rows="3"
              :disabled="submitting"
            ></textarea>
            <button class="button button-danger" type="submit" :disabled="submitting">
              {{ submitting ? "Saving…" : "Dispute completion" }}
            </button>
          </form>
        </section>

        <section v-else-if="obligation.status === 'REPORTED' && isOwing" class="fulfillment-state">
          <h3>Waiting for the recipient</h3>
          <p>They can confirm receipt or dispute this completion report.</p>
        </section>

        <section v-if="obligation.status === 'DISPUTED' && isRecipient" class="fulfillment-state">
          <h3>Completion is disputed</h3>
          <p>{{ usernameFor(obligation.owing) }} can complete the obligation and submit a revised report.</p>
        </section>

        <section v-if="obligation.status === 'COMPLETE'" class="fulfillment-state completion-complete">
          <h3>Obligation complete</h3>
          <p>{{ usernameFor(obligation.recipient) }} confirmed receipt.</p>
        </section>
      </section>
    </template>
  </section>
</template>
