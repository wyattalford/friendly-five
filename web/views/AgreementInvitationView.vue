<script setup lang="ts">
import { computed, inject, onMounted, ref, watch, type Ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api.ts";

type InvitationResult = Awaited<ReturnType<typeof api.agreements.invite>>;
type DirectResult = Awaited<ReturnType<typeof api.agreements.get>>;
type AgreementDetails = Exclude<InvitationResult | DirectResult, { error: unknown }>;

const route = useRoute();
const currentUserId = inject<Readonly<Ref<string>>>("currentUserId");
if (currentUserId === undefined) throw new Error("Agreement view requires authentication context.");

const agreement = ref<AgreementDetails | null>(null);
const loading = ref(true);
const accepting = ref(false);
const revising = ref(false);
const revisionMode = ref(false);
const error = ref("");
const notice = ref("");
const revisionClaim = ref("");
const revisionDeadline = ref("");
const revisionInitiatorStake = ref("");
const revisionCounterpartStake = ref("");
const revisionExceptions = ref("");
const revisionRule = ref("");
const revisionResolverUsername = ref("");

const token = computed(() => String(route.params.token ?? ""));
const agreementId = computed(() => String(route.params.agreement ?? ""));
const canAccept = computed(
  () =>
    agreement.value?.status === "PENDING" &&
    (agreement.value.initiator === currentUserId.value ||
      agreement.value.counterpart === currentUserId.value) &&
    agreement.value.author !== currentUserId.value,
);
const canRevise = computed(
  () =>
    agreement.value?.status === "PENDING" &&
    (agreement.value.initiator === currentUserId.value ||
      agreement.value.counterpart === currentUserId.value),
);
const awaitingUsername = computed(() => {
  if (agreement.value === null) return "the other participant";
  return agreement.value.author === agreement.value.initiator
    ? agreement.value.counterpartUsername
    : agreement.value.initiatorUsername;
});
const revisionRecipientUsername = computed(() => {
  if (agreement.value === null) return "the other participant";
  return currentUserId.value === agreement.value.initiator
    ? agreement.value.counterpartUsername
    : agreement.value.initiatorUsername;
});

function invitationError(code: string): string {
  if (code === "FORBIDDEN") return "You are not authorized to view this agreement.";
  if (code === "NOT_FOUND") return "This invitation is invalid or has been revoked.";
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and open the invitation again.";
  if (code === "NETWORK_ERROR") return "FriendlyFive could not reach the server. Try again.";
  return "FriendlyFive could not load this agreement. Try again.";
}

function acceptanceError(code: string): string {
  if (code === "FORBIDDEN") return "Only the other participant can accept this version.";
  if (code === "INVALID_REQUEST") return "This proposal can no longer be accepted.";
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and try again.";
  return "FriendlyFive could not accept this agreement. Try again.";
}

function revisionError(code: string): string {
  if (code === "NOT_FOUND") return "The resolver username was not found.";
  if (code === "FORBIDDEN") return "Only an agreement participant can propose changes.";
  if (code === "INVALID_REQUEST") {
    return "Change at least one term and choose a future cutoff. The current version may also have changed.";
  }
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and try again.";
  if (code === "NETWORK_ERROR") return "FriendlyFive could not reach the server. Try again.";
  return "FriendlyFive could not submit the counter proposal. Try again.";
}

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function asLocalInput(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function startRevision(): void {
  if (agreement.value === null) return;
  revisionClaim.value = agreement.value.claim;
  revisionDeadline.value = asLocalInput(agreement.value.deadline);
  revisionInitiatorStake.value = agreement.value.initiatorStake;
  revisionCounterpartStake.value = agreement.value.counterpartStake;
  revisionExceptions.value = agreement.value.exceptions;
  revisionRule.value = agreement.value.resolutionRule;
  revisionResolverUsername.value = "resolverUsername" in agreement.value
    ? agreement.value.resolverUsername
    : "";
  error.value = "";
  notice.value = "";
  revisionMode.value = true;
}

function cancelRevision(): void {
  revisionMode.value = false;
  error.value = "";
}

async function loadAgreement(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const result = token.value === ""
      ? await api.agreements.get({ agreement: agreementId.value })
      : await api.agreements.invite({ token: token.value });
    if ("error" in result) {
      agreement.value = null;
      error.value = invitationError(result.error);
      return;
    }
    agreement.value = result;
  } catch {
    agreement.value = null;
    error.value = "FriendlyFive could not load this agreement. Try again.";
  } finally {
    loading.value = false;
  }
}

async function acceptAgreement(): Promise<void> {
  if (agreement.value === null) return;
  accepting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.agreements.accept({
      agreement: agreement.value.agreement,
      version: agreement.value.version,
    });
    if ("error" in result) {
      error.value = acceptanceError(result.error);
      return;
    }
    notice.value = "Agreement accepted. These terms are now fixed.";
    await loadAgreement();
  } catch {
    error.value = "FriendlyFive could not accept this agreement. Try again.";
  } finally {
    accepting.value = false;
  }
}

async function submitRevision(): Promise<void> {
  if (agreement.value === null) return;
  const deadline = new Date(revisionDeadline.value);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= Date.now()) {
    error.value = "Choose a resolution cutoff in the future.";
    return;
  }

  revising.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await api.agreements.revise({
      agreement: agreement.value.agreement,
      expectedVersion: agreement.value.version,
      claim: revisionClaim.value.trim(),
      deadline: deadline.toISOString(),
      initiatorStake: revisionInitiatorStake.value.trim(),
      counterpartStake: revisionCounterpartStake.value.trim(),
      exceptions: revisionExceptions.value.trim(),
      resolutionRule: revisionRule.value.trim(),
      resolverUsername: revisionResolverUsername.value.trim(),
    });
    if ("error" in result) {
      error.value = revisionError(result.error);
      return;
    }
    revisionMode.value = false;
    await loadAgreement();
    notice.value = `Version ${agreement.value?.number ?? ""} proposed. ${awaitingUsername.value} must accept these terms.`;
  } catch {
    error.value = "FriendlyFive could not submit the counter proposal. Try again.";
  } finally {
    revising.value = false;
  }
}

onMounted(loadAgreement);
watch([token, agreementId], loadAgreement);
</script>

<template>
  <section class="page-content agreement-page" aria-labelledby="agreement-heading">
    <RouterLink class="back-link" :to="{ name: 'home' }">← Home</RouterLink>

    <div v-if="loading" class="welcome-card content-card">
      <p class="eyebrow">Agreement</p>
      <h1 id="agreement-heading">Loading the agreement…</h1>
    </div>

    <div v-else-if="error && !agreement" class="welcome-card content-card">
      <p class="eyebrow">Agreement unavailable</p>
      <h1 id="agreement-heading">This agreement could not be opened.</h1>
      <p class="notice notice-error" role="alert">{{ error }}</p>
    </div>

    <template v-else-if="agreement">
      <div class="agreement-header">
        <div>
          <p class="eyebrow">Agreement version {{ agreement.number }}</p>
          <h1 id="agreement-heading">{{ agreement.claim }}</h1>
        </div>
        <span class="status-badge" :class="`status-${agreement.status.toLowerCase()}`">
          {{ agreement.status }}
        </span>
      </div>

      <div class="terms-grid">
        <section class="terms-card">
          <h2>People and positions</h2>
          <dl>
            <div>
              <dt>{{ agreement.initiatorUsername }} backs true</dt>
              <dd>Owes {{ agreement.initiatorStake }} if the claim is false.</dd>
            </div>
            <div>
              <dt>{{ agreement.counterpartUsername }} backs false</dt>
              <dd>Owes {{ agreement.counterpartStake }} if the claim is true.</dd>
            </div>
            <div v-if="'resolverUsername' in agreement">
              <dt>Resolver</dt>
              <dd>{{ agreement.resolverUsername }}</dd>
            </div>
          </dl>
        </section>

        <section class="terms-card">
          <h2>Resolution</h2>
          <dl>
            <div>
              <dt>Cutoff</dt>
              <dd>{{ formatDeadline(agreement.deadline) }}</dd>
            </div>
            <div>
              <dt>Rule</dt>
              <dd>{{ agreement.resolutionRule }}</dd>
            </div>
            <div v-if="agreement.exceptions">
              <dt>Exceptions</dt>
              <dd>{{ agreement.exceptions }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section class="acceptance-card">
        <p v-if="agreement.status === 'ACCEPTED'">
          These terms are fixed. The resolution case is ready for outcome reporting after the cutoff.
        </p>
        <p v-else-if="canAccept">
          Review every term before accepting. Acceptance fixes this version for both participants.
        </p>
        <p v-else>
          This version was proposed by {{ agreement.authorUsername }} and is waiting for
          {{ awaitingUsername }} to accept it.
        </p>

        <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
        <p v-if="error && !revisionMode" class="notice notice-error" role="alert">{{ error }}</p>

        <button
          v-if="canAccept && !revisionMode"
          class="button button-primary"
          type="button"
          :disabled="accepting"
          @click="acceptAgreement"
        >
          {{ accepting ? "Accepting…" : "Accept current terms" }}
        </button>
        <button
          v-if="canRevise && !revisionMode"
          class="button button-secondary"
          type="button"
          :disabled="accepting || revising"
          @click="startRevision"
        >
          Propose changes
        </button>
        <RouterLink
          v-if="agreement.status === 'ACCEPTED'"
          class="button button-primary button-link"
          :to="{ name: 'agreement-resolution', params: { agreement: agreement.agreement } }"
        >
          Open outcome resolution
        </RouterLink>
      </section>

      <form
        v-if="revisionMode"
        class="action-card agreement-form revision-form"
        @submit.prevent="submitRevision"
      >
        <div>
          <p class="eyebrow">Counter proposal</p>
          <h2>Revise the current terms</h2>
          <p>
            This creates a new version. {{ revisionRecipientUsername }} must accept it before the agreement is fixed.
          </p>
        </div>

        <fieldset>
          <legend>Terms</legend>
          <div class="form-field">
            <label for="revision-claim">Claim</label>
            <textarea id="revision-claim" v-model="revisionClaim" required rows="3" :disabled="revising"></textarea>
          </div>
          <div class="field-grid">
            <div class="form-field">
              <label for="revision-initiator-stake">
                What {{ agreement.initiatorUsername }} owes if the claim is false
              </label>
              <input id="revision-initiator-stake" v-model="revisionInitiatorStake" required :disabled="revising" />
            </div>
            <div class="form-field">
              <label for="revision-counterpart-stake">
                What {{ agreement.counterpartUsername }} owes if the claim is true
              </label>
              <input id="revision-counterpart-stake" v-model="revisionCounterpartStake" required :disabled="revising" />
            </div>
          </div>
          <div class="form-field">
            <label for="revision-exceptions">Exceptions <span>optional</span></label>
            <textarea id="revision-exceptions" v-model="revisionExceptions" rows="2" :disabled="revising"></textarea>
          </div>
        </fieldset>

        <fieldset>
          <legend>Resolution</legend>
          <div class="field-grid">
            <div class="form-field">
              <label for="revision-deadline">Resolution cutoff</label>
              <input id="revision-deadline" v-model="revisionDeadline" type="datetime-local" required :disabled="revising" />
            </div>
            <div class="form-field">
              <label for="revision-resolver">Resolver username <span>optional</span></label>
              <input id="revision-resolver" v-model="revisionResolverUsername" autocomplete="off" :disabled="revising" />
            </div>
          </div>
          <div class="form-field">
            <label for="revision-rule">How the outcome will be determined</label>
            <textarea id="revision-rule" v-model="revisionRule" required rows="3" :disabled="revising"></textarea>
          </div>
        </fieldset>

        <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
        <div class="action-row revision-actions">
          <button class="button button-primary" type="submit" :disabled="revising">
            {{ revising ? "Submitting changes…" : "Submit counter proposal" }}
          </button>
          <button class="button button-secondary" type="button" :disabled="revising" @click="cancelRevision">
            Cancel
          </button>
        </div>
      </form>
    </template>
  </section>
</template>
