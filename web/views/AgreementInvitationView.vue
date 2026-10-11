<script setup lang="ts">
import { computed, inject, onMounted, ref, watch, type Ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "../api.ts";

type InvitationResult = Awaited<ReturnType<typeof api.agreements.invite>>;
type AgreementDetails = Exclude<InvitationResult, { error: unknown }>;

const route = useRoute();
const currentUserId = inject<Readonly<Ref<string>>>("currentUserId");
if (currentUserId === undefined) throw new Error("Agreement view requires authentication context.");

const agreement = ref<AgreementDetails | null>(null);
const loading = ref(true);
const accepting = ref(false);
const error = ref("");
const notice = ref("");

const token = computed(() => String(route.params.token ?? ""));
const canAccept = computed(
  () =>
    agreement.value?.status === "PENDING" &&
    agreement.value.counterpart === currentUserId.value &&
    agreement.value.author !== currentUserId.value,
);

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

function formatDeadline(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function loadAgreement(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const result = await api.agreements.invite({ token: token.value });
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

onMounted(loadAgreement);
watch(token, loadAgreement);
</script>

<template>
  <section class="page-content agreement-page" aria-labelledby="agreement-heading">
    <RouterLink class="back-link" :to="{ name: 'home' }">← Home</RouterLink>

    <div v-if="loading" class="welcome-card content-card">
      <p class="eyebrow">Agreement</p>
      <h1 id="agreement-heading">Loading the invitation…</h1>
    </div>

    <div v-else-if="error && !agreement" class="welcome-card content-card">
      <p class="eyebrow">Invitation unavailable</p>
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
          This proposal is waiting for {{ agreement.counterpartUsername }} to accept it.
        </p>

        <p v-if="notice" class="notice notice-success" role="status">{{ notice }}</p>
        <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

        <button
          v-if="canAccept"
          class="button button-primary"
          type="button"
          :disabled="accepting"
          @click="acceptAgreement"
        >
          {{ accepting ? "Accepting…" : "Accept current terms" }}
        </button>
        <RouterLink
          v-if="agreement.status === 'ACCEPTED'"
          class="button button-primary button-link"
          :to="{ name: 'agreement-resolution', params: { agreement: agreement.agreement } }"
        >
          Open outcome resolution
        </RouterLink>
      </section>
    </template>
  </section>
</template>
