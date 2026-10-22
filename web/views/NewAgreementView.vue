<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { api } from "../api.ts";

const router = useRouter();
const counterpartIdentifier = ref("");
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
type ProposalResult = Awaited<ReturnType<typeof api.agreements.propose>>;
const invitation = ref<Exclude<ProposalResult, { error: unknown }> | null>(null);
const copiedResolver = ref(false);

const invitationUrl = computed(() => {
  if (invitation.value === null) return "";
  const location = router.resolve({
    name: "agreement-invite",
    params: { token: invitation.value.token },
  });
  return new URL(location.href, window.location.origin).toString();
});

const resolverInvitationUrl = computed(() => {
  if (!invitation.value || !("resolverToken" in invitation.value) || !invitation.value.resolverToken) return "";
  return new URL(router.resolve({ name: "agreement-invite", params: { token: invitation.value.resolverToken } }).href, window.location.origin).toString();
});

function proposalError(code: string): string {
  if (code === "NOT_FOUND") return "Use an existing username or an available email for each person.";
  if (code === "CONFLICT") return "That email already has an account or a pending invitation.";
  if (code === "INVALID_REQUEST") {
    return "Check the required terms and choose a future cutoff.";
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
      counterpartIdentifier: counterpartIdentifier.value.trim(),
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

async function copyInvitation(recipient: "counterpart" | "resolver" = "counterpart"): Promise<void> {
  try {
    await navigator.clipboard.writeText(recipient === "resolver" ? resolverInvitationUrl.value : invitationUrl.value);
    if (recipient === "resolver") copiedResolver.value = true;
    else copied.value = true;
  } catch {
    error.value = "Copying failed. Select and copy the invitation URL below.";
  }
}
</script>

<template>
  <section v-if="invitation" class="page-content welcome-card content-card" aria-labelledby="created-heading">
    <p class="eyebrow">Proposal created</p>
    <h1 id="created-heading">{{ resolverInvitationUrl ? "Share the invitations." : "Send the invitation to your counterpart." }}</h1>
    <p class="intro">
      <template v-if="invitation.requiresRegistration">
        This email did not have an account, so FriendlyFive associated it with this invitation.
        Your counterpart will choose their own username before reviewing the proposal.
      </template>
      <template v-else>
        Your proposal counts as your approval of this version. The terms remain pending
        until the other participant accepts them.
      </template>
    </p>

    <div class="invitation-box">
      <label for="invitation-url">Counterpart invitation URL</label>
      <div class="copy-row">
        <input id="invitation-url" :value="invitationUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="button button-secondary compact-button" type="button" :aria-label="copied ? 'Counterpart link copied' : 'Copy counterpart invitation link'" @click="copyInvitation()">
          {{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
    </div>

    <div v-if="resolverInvitationUrl" class="invitation-box">
      <label for="resolver-invitation-url">Resolver invitation URL</label>
      <p class="field-help">Share this link privately with the resolver. It opens their registration or sign-in flow, separately from your counterpart’s link.</p>
      <div class="copy-row">
        <input id="resolver-invitation-url" :value="resolverInvitationUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button class="button button-secondary compact-button" type="button" :aria-label="copiedResolver ? 'Resolver link copied' : 'Copy resolver invitation link'" @click="copyInvitation('resolver')">{{ copiedResolver ? "Copied" : "Copy" }}</button>
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
            <label for="counterpart">Counterpart email or username</label>
            <input id="counterpart" v-model="counterpartIdentifier" required autocomplete="off" aria-describedby="counterpart-help invitation-resolver-help" :disabled="submitting" />
            <p id="counterpart-help" class="field-help">Use an existing account’s username or email, or invite someone new by email.</p>
          </div>
          <div class="form-field">
            <label for="resolver">Resolver email or username <span>optional</span></label>
            <input id="resolver" v-model="resolverUsername" autocomplete="off" aria-describedby="resolver-help invitation-resolver-help" :disabled="submitting" />
            <p id="resolver-help" class="field-help">Use an existing account’s username or email, or invite a new resolver by email. Either participant may be the resolver if both agree.</p>
          </div>
        </div>
        <p id="invitation-resolver-help" class="field-help">
          You can invite a counterpart and a resolver who haven’t registered yet. You’ll get a separate link for each person.
          Both participants agree to the resolver when accepting the terms.
        </p>
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
