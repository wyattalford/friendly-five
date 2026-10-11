<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { api } from "../api.ts";

const router = useRouter();
const counterpartUsername = ref("");
const resolverUsername = ref("");
const claim = ref("");
const deadline = ref("");
const initiatorStake = ref("");
const counterpartStake = ref("");
const exceptions = ref("");
const resolutionRule = ref("");
const submitting = ref(false);
const error = ref("");
const copied = ref(false);
const invitation = ref<{ agreement: string; version: string; link: string; token: string } | null>(null);

const invitationUrl = computed(() => {
  if (invitation.value === null) return "";
  const location = router.resolve({
    name: "agreement-invite",
    params: { token: invitation.value.token },
  });
  return new URL(location.href, window.location.origin).toString();
});

function proposalError(code: string): string {
  if (code === "NOT_FOUND") return "The counterpart or resolver username was not found.";
  if (code === "INVALID_REQUEST") {
    return "Check the required terms and choose a resolution deadline in the future.";
  }
  if (code === "UNAUTHORIZED") return "Your session ended. Sign in and try again.";
  if (code === "NETWORK_ERROR") return "FriendlyFive could not reach the server. Try again.";
  return "FriendlyFive could not create the agreement. Try again.";
}

async function submitProposal(): Promise<void> {
  error.value = "";
  copied.value = false;
  const due = new Date(deadline.value);
  if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) {
    error.value = "Choose a resolution deadline in the future.";
    return;
  }

  submitting.value = true;
  try {
    const result = await api.agreements.propose({
      counterpartUsername: counterpartUsername.value.trim(),
      resolverUsername: resolverUsername.value.trim(),
      claim: claim.value.trim(),
      deadline: due.toISOString(),
      initiatorStake: initiatorStake.value.trim(),
      counterpartStake: counterpartStake.value.trim(),
      exceptions: exceptions.value.trim(),
      resolutionRule: resolutionRule.value.trim(),
    });
    if ("error" in result) {
      error.value = proposalError(result.error);
      return;
    }
    invitation.value = result;
  } catch {
    error.value = "FriendlyFive could not create the agreement. Try again.";
  } finally {
    submitting.value = false;
  }
}

async function copyInvitation(): Promise<void> {
  try {
    await navigator.clipboard.writeText(invitationUrl.value);
    copied.value = true;
  } catch {
    error.value = "Copying failed. Select and copy the invitation URL below.";
  }
}
</script>

<template>
  <section v-if="invitation" class="page-content welcome-card content-card" aria-labelledby="created-heading">
    <p class="eyebrow">Proposal created</p>
    <h1 id="created-heading">Send the invitation to your counterpart.</h1>
    <p class="intro">
      Your proposal counts as your approval of this version. The terms remain pending
      until the other participant accepts them.
    </p>

    <div class="invitation-box">
      <label for="invitation-url">Invitation URL</label>
      <div class="copy-row">
        <input id="invitation-url" :value="invitationUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="button button-secondary compact-button" type="button" @click="copyInvitation">
          {{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
    </div>

    <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>

    <div class="action-row">
      <RouterLink
        class="button button-primary button-link"
        :to="{ name: 'agreement-invite', params: { token: invitation.token } }"
      >
        Review agreement
      </RouterLink>
      <RouterLink class="button button-secondary button-link" :to="{ name: 'home' }">
        Return home
      </RouterLink>
    </div>
  </section>

  <section v-else class="page-content form-page" aria-labelledby="proposal-heading">
    <RouterLink class="back-link" :to="{ name: 'home' }">← Back</RouterLink>
    <div class="page-heading">
      <p class="eyebrow">New agreement</p>
      <h1 id="proposal-heading">Record the exact terms.</h1>
      <p class="intro">You back the claim being true. Your counterpart backs it being false.</p>
    </div>

    <form class="agreement-form" @submit.prevent="submitProposal">
      <fieldset>
        <legend>People</legend>
        <div class="field-grid">
          <div class="form-field">
            <label for="counterpart">Counterpart username</label>
            <input id="counterpart" v-model="counterpartUsername" required autocomplete="off" :disabled="submitting" />
            <p class="field-help">This person will review and accept the proposal.</p>
          </div>
          <div class="form-field">
            <label for="resolver">Resolver username <span>optional</span></label>
            <input id="resolver" v-model="resolverUsername" autocomplete="off" :disabled="submitting" />
            <p class="field-help">The resolver may decide the outcome after a dispute.</p>
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Terms</legend>
        <div class="form-field">
          <label for="claim">Claim</label>
          <textarea id="claim" v-model="claim" required rows="3" :disabled="submitting"></textarea>
          <p class="field-help">Write a statement that can ultimately be judged true or false.</p>
        </div>
        <div class="field-grid">
          <div class="form-field">
            <label for="initiator-stake">What you owe if the claim is false</label>
            <input id="initiator-stake" v-model="initiatorStake" required :disabled="submitting" />
          </div>
          <div class="form-field">
            <label for="counterpart-stake">What your counterpart owes if the claim is true</label>
            <input id="counterpart-stake" v-model="counterpartStake" required :disabled="submitting" />
          </div>
        </div>
        <div class="form-field">
          <label for="exceptions">Exceptions <span>optional</span></label>
          <textarea id="exceptions" v-model="exceptions" rows="2" :disabled="submitting"></textarea>
        </div>
      </fieldset>

      <fieldset>
        <legend>Resolution</legend>
        <div class="form-field">
          <label for="deadline">Resolution cutoff</label>
          <input id="deadline" v-model="deadline" type="datetime-local" required :disabled="submitting" />
          <p class="field-help">Outcome reporting becomes available at this time.</p>
        </div>
        <div class="form-field">
          <label for="resolution-rule">How the outcome will be determined</label>
          <textarea id="resolution-rule" v-model="resolutionRule" required rows="3" :disabled="submitting"></textarea>
        </div>
      </fieldset>

      <p v-if="error" class="notice notice-error" role="alert">{{ error }}</p>
      <button class="button button-primary submit-button" type="submit" :disabled="submitting">
        {{ submitting ? "Creating proposal…" : "Create proposal" }}
      </button>
    </form>
  </section>
</template>
