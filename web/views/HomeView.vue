<script setup lang="ts">
import { computed, inject, onMounted, ref, type Ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../api.ts";

type DashboardResult = Awaited<ReturnType<typeof api.agreements.list>>;
type Dashboard = Exclude<DashboardResult, { error: unknown }>["dashboard"];
type AgreementSummary = Dashboard["agreements"][number];

const currentUserId = inject<Readonly<Ref<string>>>("currentUserId");
if (currentUserId === undefined) throw new Error("Home view requires authentication context.");

const agreements = ref<AgreementSummary[]>([]);
const loading = ref(true);
const error = ref("");

const orderedAgreements = computed(() =>
  [...agreements.value].sort((left, right) => {
    if (left.status !== right.status) return left.status === "PENDING" ? -1 : 1;
    return new Date(left.deadline).getTime() - new Date(right.deadline).getTime();
  }),
);

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleFor(agreement: AgreementSummary): string {
  if (agreement.initiator === currentUserId.value) return "Initiator · backs true";
  if (agreement.counterpart === currentUserId.value) return "Counterpart · backs false";
  return "Designated resolver";
}

function peopleFor(agreement: AgreementSummary): string {
  return `${agreement.initiatorUsername} and ${agreement.counterpartUsername}`;
}

function destinationFor(agreement: AgreementSummary) {
  if (agreement.status === "PENDING") {
    return { name: "agreement-review", params: { agreement: agreement.agreement } };
  }
  return { name: "agreement-resolution", params: { agreement: agreement.agreement } };
}

function dashboardError(code: string): string {
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and try again.";
  if (code === "NETWORK_ERROR") return "FriendlyFive could not reach the server. Try again.";
  return "FriendlyFive could not load your agreements. Try again.";
}

async function loadAgreements(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const result = await api.agreements.list();
    if ("error" in result) {
      agreements.value = [];
      error.value = dashboardError(result.error);
      return;
    }
    agreements.value = result.dashboard.agreements;
  } catch {
    agreements.value = [];
    error.value = "FriendlyFive could not load your agreements. Try again.";
  } finally {
    loading.value = false;
  }
}

onMounted(loadAgreements);
</script>

<template>
  <section class="page-content dashboard-page" aria-labelledby="home-heading">
    <div class="dashboard-heading">
      <div>
        <p class="eyebrow">My agreements</p>
        <h1 id="home-heading">Keep every bet in one place.</h1>
        <p class="intro">
          Review invitations, follow accepted outcomes, and finish resulting obligations.
        </p>
      </div>
      <RouterLink class="button button-primary button-link" :to="{ name: 'agreement-new' }">
        New agreement
      </RouterLink>
    </div>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <section v-if="loading" class="dashboard-state" aria-live="polite">
      <h2>Loading agreements…</h2>
    </section>

    <section v-else-if="orderedAgreements.length === 0 && !error" class="dashboard-state">
      <h2>No agreements yet</h2>
      <p>Create an agreement or open an invitation shared with you.</p>
    </section>

    <ul v-else-if="orderedAgreements.length > 0" class="agreement-list">
      <li v-for="agreement in orderedAgreements" :key="agreement.agreement">
        <RouterLink class="agreement-list-item" :to="destinationFor(agreement)">
          <div class="agreement-list-main">
            <div class="agreement-list-title">
              <h2>{{ agreement.claim }}</h2>
              <span class="status-badge" :class="`status-${agreement.status.toLowerCase()}`">
                {{ agreement.status }}
              </span>
            </div>
            <p>{{ peopleFor(agreement) }}</p>
          </div>
          <dl class="agreement-list-meta">
            <div>
              <dt>Your role</dt>
              <dd>{{ roleFor(agreement) }}</dd>
            </div>
            <div>
              <dt>Resolution cutoff</dt>
              <dd>{{ formatDate(agreement.deadline) }}</dd>
            </div>
          </dl>
          <span class="agreement-list-action">
            {{ agreement.status === "PENDING" ? "Review terms" : "Open agreement" }} →
          </span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
