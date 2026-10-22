<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch, type Ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api.ts";
import AgreementHistory from "../components/AgreementHistory.vue";

type Outcome = "TRUE" | "FALSE" | "VOID";
type AgreementResult = Awaited<ReturnType<typeof api.agreements.get>>;
type AgreementDetails = Exclude<AgreementResult, { error: unknown }>;
type AgreementHistoryResult = Awaited<ReturnType<typeof api.agreements.history>>;
type AgreementHistoryDetails = Exclude<AgreementHistoryResult, { error: unknown }>;
type AgreementVersion = AgreementHistoryDetails["history"]["versions"][number];
type ResolutionResult = Awaited<ReturnType<typeof api.resolutions["by-agreement"]>>;
type ResolutionDetails = Exclude<ResolutionResult, { error: unknown }>;
type ReportResult = Awaited<ReturnType<typeof api.resolutions.current>>;
type ReportDetails = Exclude<ReportResult, { error: unknown }>;
type HistoryResult = Awaited<ReturnType<typeof api.resolutions.history>>;
type HistoryDetails = Exclude<HistoryResult, { error: unknown }>;
type HistoryReport = HistoryDetails["history"]["reports"][number];
type ResolutionImagesResult = Awaited<ReturnType<typeof api.resolutions.images>>;
type ResolutionImagesDetails = Exclude<ResolutionImagesResult, { error: unknown }>;
type ResolutionImage = ResolutionImagesDetails["images"]["attachments"][number];
type ObligationResult = Awaited<ReturnType<typeof api.obligations["by-agreement"]>>;
type ObligationDetails = Exclude<ObligationResult, { error: unknown }>;
type CompletionResult = Awaited<ReturnType<typeof api.obligations.current>>;
type CompletionDetails = Exclude<CompletionResult, { error: unknown }>;
type ObligationImagesResult = Awaited<ReturnType<typeof api.obligations.images>>;
type ObligationImagesDetails = Exclude<ObligationImagesResult, { error: unknown }>;
type ObligationImage = ObligationImagesDetails["images"]["attachments"][number];

const route = useRoute();
const currentUserId = inject<Readonly<Ref<string>>>("currentUserId");
if (currentUserId === undefined) throw new Error("Resolution view requires authentication context.");

const agreement = ref<AgreementDetails | null>(null);
const agreementHistory = ref<AgreementVersion[]>([]);
const resolution = ref<ResolutionDetails | null>(null);
const currentReport = ref<ReportDetails | null>(null);
const reportHistory = ref<HistoryReport[]>([]);
const resolutionImages = ref<ResolutionImage[]>([]);
const obligation = ref<ObligationDetails | null>(null);
const currentCompletion = ref<CompletionDetails | null>(null);
const obligationImages = ref<ObligationImage[]>([]);
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
type ImagePurpose = "report" | "dispute" | "decision" | "completion" | "completionDispute";
type ImageDraft = { data: string; name: string };
const reportImage = ref<ImageDraft | null>(null);
const disputeImage = ref<ImageDraft | null>(null);
const decisionImage = ref<ImageDraft | null>(null);
const completionImage = ref<ImageDraft | null>(null);
const completionDisputeImage = ref<ImageDraft | null>(null);
const currentTime = ref(Date.now());
const serverClockOffsetMs = ref(0);
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

function imagesFor(report: string): ResolutionImage | undefined {
  return resolutionImages.value.find((attachment) => attachment.report === report);
}

function completionImagesFor(report: string): ObligationImage | undefined {
  return obligationImages.value.find((attachment) => attachment.report === report);
}

function draftFor(purpose: ImagePurpose): Ref<ImageDraft | null> {
  if (purpose === "report") return reportImage;
  if (purpose === "dispute") return disputeImage;
  if (purpose === "decision") return decisionImage;
  if (purpose === "completion") return completionImage;
  return completionDisputeImage;
}

function imagePayload(draft: ImageDraft | null) {
  return draft === null
    ? {}
    : { evidenceImage: draft.data, evidenceImageName: draft.name };
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("The image could not be read.")));
    reader.readAsDataURL(blob);
  });
}

async function compressedImage(file: File): Promise<ImageDraft> {
  const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!acceptedTypes.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Choose an image smaller than 10 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (context === null) {
    bitmap.close();
    throw new Error("This browser could not prepare the image.");
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (blob === null || blob.size > 2 * 1024 * 1024) {
    throw new Error("The prepared image is still too large. Choose a smaller image.");
  }
  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "evidence";
  return { data: await dataUrl(blob), name: `${baseName.slice(0, 116)}.jpg` };
}

async function chooseEvidenceImage(event: Event, purpose: ImagePurpose): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (file === undefined) return;
  error.value = "";
  try {
    draftFor(purpose).value = await compressedImage(file);
  } catch (imageError) {
    draftFor(purpose).value = null;
    error.value = imageError instanceof Error ? imageError.message : "The image could not be prepared.";
  } finally {
    input.value = "";
  }
}

function removeEvidenceImage(purpose: ImagePurpose): void {
  draftFor(purpose).value = null;
}

function requestError(code: string): string {
  if (code === "FORBIDDEN") return "You are not authorized to use this resolution case.";
  if (code === "NOT_FOUND") return "The resolution case could not be found.";
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and try again.";
  if (code === "INVALID_REQUEST") return "This action could not be saved. Check the required fields, then update the details and try again. Your entered text is kept.";
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
  currentTime.value = Date.now() + serverClockOffsetMs.value;
  if (resolution.value === null) return;

  const remaining = new Date(resolution.value.cutoff).getTime() - currentTime.value;
  if (remaining <= 0) return;
  cutoffTimer = setTimeout(() => {
    currentTime.value = Date.now() + serverClockOffsetMs.value;
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
    obligationImages.value = [];
    return;
  }

  const obligationResult = await api.obligations["by-agreement"]({
    agreement: agreementId.value,
  });
  if ("error" in obligationResult) {
    obligation.value = null;
    currentCompletion.value = null;
    obligationImages.value = [];
    error.value = obligationRequestError(obligationResult.error);
    return;
  }
  obligation.value = obligationResult;

  if (obligationResult.status === "DUE") {
    currentCompletion.value = null;
    obligationImages.value = [];
    return;
  }

  const completionResult = await api.obligations.current({
    obligation: obligationResult.obligation,
  });
  if ("error" in completionResult) {
    currentCompletion.value = null;
    obligationImages.value = [];
    error.value = obligationRequestError(completionResult.error);
    return;
  }
  currentCompletion.value = completionResult;

  const imagesResult = await api.obligations.images({ obligation: obligationResult.obligation });
  if ("error" in imagesResult) {
    obligationImages.value = [];
    error.value = obligationRequestError(imagesResult.error);
    return;
  }
  obligationImages.value = imagesResult.images.attachments;
}

async function loadPage(showLoading = true): Promise<void> {
  if (showLoading) loading.value = true;
  error.value = "";
  try {
    const agreementResult = await api.agreements.get({ agreement: agreementId.value });
    if ("error" in agreementResult) {
      agreement.value = null;
      agreementHistory.value = [];
      resolution.value = null;
      currentReport.value = null;
      reportHistory.value = [];
      resolutionImages.value = [];
      obligation.value = null;
      currentCompletion.value = null;
      obligationImages.value = [];
      error.value = requestError(agreementResult.error);
      return;
    }
    agreement.value = agreementResult;

    const agreementHistoryResult = await api.agreements.history({ agreement: agreementId.value });
    if ("error" in agreementHistoryResult) {
      agreementHistory.value = [];
      error.value = requestError(agreementHistoryResult.error);
      return;
    }
    agreementHistory.value = agreementHistoryResult.history.versions;

    const requestStartedAt = Date.now();
    const resolutionResult = await api.resolutions["by-agreement"]({
      agreement: agreementId.value,
    });
    const responseReceivedAt = Date.now();
    if ("error" in resolutionResult) {
      resolution.value = null;
      currentReport.value = null;
      reportHistory.value = [];
      resolutionImages.value = [];
      obligation.value = null;
      currentCompletion.value = null;
      obligationImages.value = [];
      error.value = requestError(resolutionResult.error);
      return;
    }
    resolution.value = resolutionResult;
    serverClockOffsetMs.value =
      new Date(resolutionResult.serverTime).getTime() -
      (requestStartedAt + responseReceivedAt) / 2;
    scheduleCutoffUpdate();

    const historyResult = await api.resolutions.history({ case: resolutionResult.case });
    if ("error" in historyResult) {
      reportHistory.value = [];
      error.value = requestError(historyResult.error);
      return;
    }
    reportHistory.value = historyResult.history.reports;

    const imagesResult = await api.resolutions.images({ case: resolutionResult.case });
    if ("error" in imagesResult) {
      resolutionImages.value = [];
      error.value = requestError(imagesResult.error);
      return;
    }
    resolutionImages.value = imagesResult.images.attachments;

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
  if (submitting.value) return;
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
      ...imagePayload(reportImage.value),
    });
    if ("error" in result) {
      if (result.error === "INVALID_REQUEST") {
        await loadPage(false);
        if (!cutoffPassed.value && resolution.value !== null) {
          error.value = `Reporting opens after ${formatDate(resolution.value.cutoff)} according to the server clock.`;
          return;
        }
      }
      error.value = requestError(result.error);
      return;
    }
    reportEvidence.value = "";
    reportImage.value = null;
    await loadPage(false);
    notice.value = "Outcome submitted. The other participant can now confirm or dispute it.";
  } catch {
    error.value = "FriendlyFive could not submit the outcome. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function confirmReport(): Promise<void> {
  if (submitting.value) return;
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
  if (submitting.value) return;
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
      ...imagePayload(disputeImage.value),
    });
    if ("error" in result) {
      error.value = requestError(result.error);
      return;
    }
    disputeReason.value = "";
    disputeImage.value = null;
    await loadPage(false);
    notice.value = isResolver.value
      ? "Dispute recorded. You may submit a resolver decision."
      : agreement.value && "resolver" in agreement.value
        ? "Dispute recorded. The designated resolver may now decide, or a participant may submit a revised report."
        : "Dispute recorded. Either participant may propose a revised outcome, including voiding the agreement. The other participant must confirm it.";
  } catch {
    error.value = "FriendlyFive could not record the dispute. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function decideOutcome(): Promise<void> {
  if (submitting.value) return;
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
      ...imagePayload(decisionImage.value),
    });
    if ("error" in result) {
      error.value = requestError(result.error);
      return;
    }
    decisionEvidence.value = "";
    decisionImage.value = null;
    await loadPage(false);
    notice.value = "Resolver decision recorded. The resolution is final.";
  } catch {
    error.value = "FriendlyFive could not record the decision. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function reportCompletion(): Promise<void> {
  if (submitting.value) return;
  if (obligation.value === null) return;
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const evidence = completionEvidence.value.trim();
    const result = await api.obligations.report({
      obligation: obligation.value.obligation,
      ...(evidence === "" ? {} : { evidence }),
      ...imagePayload(completionImage.value),
    });
    if ("error" in result) {
      error.value = obligationRequestError(result.error);
      return;
    }
    completionEvidence.value = "";
    completionImage.value = null;
    await loadPage(false);
    notice.value = "Completion reported. The recipient can now confirm or dispute it.";
  } catch {
    error.value = "FriendlyFive could not report completion. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function confirmCompletion(): Promise<void> {
  if (submitting.value) return;
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
  if (submitting.value) return;
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
      ...imagePayload(completionDisputeImage.value),
    });
    if ("error" in result) {
      error.value = obligationRequestError(result.error);
      return;
    }
    completionDisputeEvidence.value = "";
    completionDisputeImage.value = null;
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
  <section class="page-content resolution-page" aria-labelledby="resolution-heading" :aria-busy="loading">
    <RouterLink class="back-link" :to="{ name: 'home' }">← Home</RouterLink>

    <div v-if="loading" class="welcome-card content-card" role="status" aria-live="polite">
      <p class="eyebrow">Agreement resolution</p>
      <h1 id="resolution-heading">Loading the outcome…</h1>
    </div>

    <div v-else-if="error && (!agreement || !resolution)" class="welcome-card content-card">
      <p class="eyebrow">Resolution unavailable</p>
      <h1 id="resolution-heading">This case could not be opened.</h1>
      <p class="notice notice-error" role="alert">{{ error }}</p>
      <button class="button button-secondary retry-button" type="button" @click="loadPage()">
        Try again
      </button>
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

      <AgreementHistory
        :versions="agreementHistory"
        :current-version="agreement.version"
        :initiator-username="agreement.initiatorUsername"
        :counterpart-username="agreement.counterpartUsername"
      />

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
        <figure v-if="imagesFor(currentReport.report)?.evidenceImage" class="evidence-image">
          <img
            :src="imagesFor(currentReport.report)?.evidenceImage"
            :alt="`Image evidence named ${imagesFor(currentReport.report)?.evidenceImageName}`"
          />
          <figcaption>{{ imagesFor(currentReport.report)?.evidenceImageName }}</figcaption>
        </figure>
        <div v-if="'disputeReason' in currentReport" class="dispute-block">
          <strong>Disputed by {{ usernameFor(currentReport.disputedBy) }}</strong>
          <p>{{ currentReport.disputeReason }}</p>
        </div>
        <figure v-if="imagesFor(currentReport.report)?.disputeImage" class="evidence-image dispute-image">
          <img
            :src="imagesFor(currentReport.report)?.disputeImage"
            :alt="`Dispute image named ${imagesFor(currentReport.report)?.disputeImageName}`"
          />
          <figcaption>{{ imagesFor(currentReport.report)?.disputeImageName }}</figcaption>
        </figure>
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
              <figure v-if="imagesFor(report.report)?.evidenceImage" class="evidence-image">
                <img
                  :src="imagesFor(report.report)?.evidenceImage"
                  :alt="`Image evidence named ${imagesFor(report.report)?.evidenceImageName}`"
                />
                <figcaption>{{ imagesFor(report.report)?.evidenceImageName }}</figcaption>
              </figure>
              <div v-if="report.disputeReason" class="dispute-block">
                <strong>Disputed by {{ usernameFor(report.disputedBy ?? "") }}</strong>
                <p>{{ report.disputeReason }}</p>
              </div>
              <figure v-if="imagesFor(report.report)?.disputeImage" class="evidence-image dispute-image">
                <img
                  :src="imagesFor(report.report)?.disputeImage"
                  :alt="`Dispute image named ${imagesFor(report.report)?.disputeImageName}`"
                />
                <figcaption>{{ imagesFor(report.report)?.disputeImageName }}</figcaption>
              </figure>
            </div>
          </li>
        </ol>
      </section>

      <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
      <div v-if="error" class="notice notice-error" role="alert">
        <p>{{ error }}</p>
        <button class="button button-secondary" type="button" :disabled="submitting || loading" @click="loadPage(false)">
          Update details
        </button>
      </div>

      <section v-if="resolution.status === 'DISPUTED'" class="action-card dispute-guidance">
        <h2>{{ 'resolver' in agreement ? "How to settle this disagreement" : "Agree on a revised outcome" }}</h2>
        <p v-if="'resolver' in agreement">
          {{ agreement.resolverUsername }} may record a final decision. Either participant may also submit a revised report for the other to confirm.
        </p>
        <p v-else>
          No resolver was selected. Either participant may submit a revised outcome, including voiding the agreement with no obligation. The other participant must confirm it. Until then, the disagreement remains open.
        </p>
      </section>

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
        <label for="report-image">Evidence photo <span>optional</span></label>
        <input
          id="report-image"
          class="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :disabled="submitting"
          @change="chooseEvidenceImage($event, 'report')"
        />
        <p class="field-help">JPEG, PNG, or WebP. FriendlyFive prepares photos for secure storage.</p>
        <figure v-if="reportImage" class="evidence-image evidence-preview">
          <img :src="reportImage.data" alt="Selected outcome evidence preview" />
          <figcaption>{{ reportImage.name }}</figcaption>
          <button class="text-button" type="button" :disabled="submitting" @click="removeEvidenceImage('report')">
            Remove photo
          </button>
        </figure>
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
          <label for="dispute-image">Supporting photo <span>optional</span></label>
          <input
            id="dispute-image"
            class="file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            :disabled="submitting"
            @change="chooseEvidenceImage($event, 'dispute')"
          />
          <figure v-if="disputeImage" class="evidence-image evidence-preview">
            <img :src="disputeImage.data" alt="Selected dispute evidence preview" />
            <figcaption>{{ disputeImage.name }}</figcaption>
            <button class="text-button" type="button" :disabled="submitting" @click="removeEvidenceImage('dispute')">
              Remove photo
            </button>
          </figure>
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
        <label for="decision-image">Supporting photo <span>optional</span></label>
        <input
          id="decision-image"
          class="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :disabled="submitting"
          @change="chooseEvidenceImage($event, 'decision')"
        />
        <figure v-if="decisionImage" class="evidence-image evidence-preview">
          <img :src="decisionImage.data" alt="Selected resolver evidence preview" />
          <figcaption>{{ decisionImage.name }}</figcaption>
          <button class="text-button" type="button" :disabled="submitting" @click="removeEvidenceImage('decision')">
            Remove photo
          </button>
        </figure>
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
          <figure v-if="completionImagesFor(currentCompletion.report)?.evidenceImage" class="evidence-image">
            <img
              :src="completionImagesFor(currentCompletion.report)?.evidenceImage"
              :alt="`Completion evidence named ${completionImagesFor(currentCompletion.report)?.evidenceImageName}`"
            />
            <figcaption>{{ completionImagesFor(currentCompletion.report)?.evidenceImageName }}</figcaption>
          </figure>
          <div v-if="'disputeEvidence' in currentCompletion" class="dispute-block">
            <strong>Recipient's dispute</strong>
            <p>{{ currentCompletion.disputeEvidence }}</p>
          </div>
          <figure v-if="completionImagesFor(currentCompletion.report)?.disputeImage" class="evidence-image dispute-image">
            <img
              :src="completionImagesFor(currentCompletion.report)?.disputeImage"
              :alt="`Completion dispute evidence named ${completionImagesFor(currentCompletion.report)?.disputeImageName}`"
            />
            <figcaption>{{ completionImagesFor(currentCompletion.report)?.disputeImageName }}</figcaption>
          </figure>
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
          <label for="completion-image">Receipt or completion photo <span>optional</span></label>
          <input
            id="completion-image"
            class="file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            :disabled="submitting"
            @change="chooseEvidenceImage($event, 'completion')"
          />
          <p class="field-help">Attach a receipt, delivery photo, or other simple proof if useful.</p>
          <figure v-if="completionImage" class="evidence-image evidence-preview">
            <img :src="completionImage.data" alt="Selected completion evidence preview" />
            <figcaption>{{ completionImage.name }}</figcaption>
            <button class="text-button" type="button" :disabled="submitting" @click="removeEvidenceImage('completion')">
              Remove photo
            </button>
          </figure>
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
            <label for="completion-dispute-image">Supporting photo <span>optional</span></label>
            <input
              id="completion-dispute-image"
              class="file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              :disabled="submitting"
              @change="chooseEvidenceImage($event, 'completionDispute')"
            />
            <figure v-if="completionDisputeImage" class="evidence-image evidence-preview">
              <img :src="completionDisputeImage.data" alt="Selected completion dispute evidence preview" />
              <figcaption>{{ completionDisputeImage.name }}</figcaption>
              <button class="text-button" type="button" :disabled="submitting" @click="removeEvidenceImage('completionDispute')">
                Remove photo
              </button>
            </figure>
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
