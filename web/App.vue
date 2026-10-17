<script setup lang="ts">
import { computed, nextTick, onMounted, provide, readonly, ref, watch } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { api } from "./api.ts";

type AuthMode = "sign-in" | "register";
type NoticeKind = "error" | "success";

const mode = ref<AuthMode>("sign-in");
const route = useRoute();
const username = ref("");
const email = ref("");
const password = ref("");
const showPassword = ref(false);
const signedInUserId = ref("");
const signedInUsername = ref("");
const notice = ref("");
const noticeKind = ref<NoticeKind>("success");
const submitting = ref(false);
const initializing = ref(true);
const passwordInput = ref<HTMLInputElement | null>(null);
const mainContent = ref<HTMLElement | null>(null);
const initialViewRendered = ref(false);
const invitationSetup = ref<{
  initiatorUsername: string;
  counterpartUsername?: string;
  counterpartEmail: string;
  requiresRegistration: boolean;
} | null>(null);

const invitationToken = computed(() => String(route.params.token ?? ""));

const signedIn = computed(() => signedInUserId.value !== "");
provide("currentUserId", readonly(signedInUserId));

watch([() => route.fullPath, signedIn, initializing], async () => {
  if (initializing.value) return;
  if (!initialViewRendered.value) {
    initialViewRendered.value = true;
    return;
  }
  await nextTick();
  const focusTarget = mainContent.value?.querySelector<HTMLElement>(
    ".page-content[aria-labelledby], h1",
  );
  if (focusTarget === undefined || focusTarget === null) return;
  focusTarget.setAttribute("tabindex", "-1");
  focusTarget.focus();
});

function showNotice(message: string, kind: NoticeKind): void {
  notice.value = message;
  noticeKind.value = kind;
}

function selectMode(nextMode: AuthMode): void {
  mode.value = nextMode;
  password.value = "";
  showPassword.value = false;
  notice.value = "";
}

async function loadInvitationSetup(): Promise<void> {
  invitationSetup.value = null;
  if (invitationToken.value === "" || signedIn.value) return;
  try {
    const result = await api.agreements.invite.setup({ token: invitationToken.value });
    if ("error" in result) {
      showNotice("This invitation is invalid or has been revoked.", "error");
      return;
    }
    invitationSetup.value = result;
    username.value = result.counterpartUsername ?? "";
    email.value = result.counterpartEmail;
    mode.value = result.requiresRegistration ? "register" : "sign-in";
    notice.value = "";
  } catch {
    showNotice("FriendlyFive could not check this invitation. Try again.", "error");
  }
}

function showSignedInUser(user: string, nextUsername: string): void {
  signedInUserId.value = user;
  signedInUsername.value = nextUsername;
}

function clearSignedInUser(): void {
  signedInUserId.value = "";
  signedInUsername.value = "";
}

function errorMessage(error: string, action: AuthMode | "sign-out"): string {
  if (error === "CONFLICT") return "That username or email is already in use.";
  if (error === "INVALID_REQUEST" && action === "sign-in") {
    return "The username or password is incorrect.";
  }
  if (error === "INVALID_REQUEST") return "Enter a username, valid email, and password.";
  if (error === "UNAUTHORIZED") return "This session is no longer active.";
  if (error === "NETWORK_ERROR") return "FriendlyFive could not reach the server. Try again.";
  return "FriendlyFive could not complete that request. Try again.";
}

async function refreshCurrentUser(): Promise<boolean> {
  const result = await api.auth.current();
  if ("error" in result) {
    clearSignedInUser();
    return false;
  }
  showSignedInUser(result.user, result.username);
  return true;
}

async function submitAuthentication(): Promise<void> {
  const submittedUsername = username.value.trim();
  const submittedEmail = email.value.trim();
  if (
    submittedUsername === "" ||
    password.value.trim() === "" ||
    (mode.value === "register" && submittedEmail === "")
  ) {
    showNotice(
      mode.value === "register" ? "Enter a username, email, and password." : "Enter a username and password.",
      "error",
    );
    return;
  }

  submitting.value = true;
  notice.value = "";
  try {
    if (mode.value === "register") {
      if (invitationSetup.value?.requiresRegistration) {
        const result = await api.auth["register-invited"]({
          token: invitationToken.value,
          username: submittedUsername,
          password: password.value,
        });
        if ("error" in result) {
          showNotice(errorMessage(result.error, "register"), "error");
          return;
        }
        password.value = "";
        showPassword.value = false;
        if (!(await refreshCurrentUser())) {
          showNotice("The invited account was created, but its session could not be loaded. Sign in.", "error");
          return;
        }
        invitationSetup.value = null;
        notice.value = "";
        return;
      }
      const result = await api.auth.register({
        username: submittedUsername,
        email: submittedEmail,
        password: password.value,
      });
      if ("error" in result) {
        showNotice(errorMessage(result.error, "register"), "error");
        return;
      }

      username.value = submittedUsername;
      password.value = "";
      showPassword.value = false;
      mode.value = "sign-in";
      showNotice("Account created. Sign in with your new account.", "success");
      await nextTick();
      passwordInput.value?.focus();
      return;
    }

    const result = await api.auth["sign-in"]({ username: submittedUsername, password: password.value });
    if ("error" in result) {
      showNotice(errorMessage(result.error, "sign-in"), "error");
      return;
    }

    password.value = "";
    showPassword.value = false;
    if (!(await refreshCurrentUser())) {
      showNotice("The session could not be loaded. Sign in again.", "error");
      return;
    }
    notice.value = "";
  } catch {
    showNotice("FriendlyFive could not complete that request. Try again.", "error");
  } finally {
    submitting.value = false;
  }
}

async function signOut(): Promise<void> {
  submitting.value = true;
  notice.value = "";
  try {
    const result = await api.auth["sign-out"]();
    if ("error" in result && result.error !== "UNAUTHORIZED") {
      showNotice(errorMessage(result.error, "sign-out"), "error");
      return;
    }

    clearSignedInUser();
    password.value = "";
    showPassword.value = false;
    showNotice(
      "error" in result ? "Your previous session ended. Sign in again." : "Signed out.",
      "success",
    );
  } catch {
    showNotice("FriendlyFive could not sign you out. Try again.", "error");
  } finally {
    submitting.value = false;
  }
}

async function loadCurrentUser(): Promise<void> {
  try {
    if (!(await refreshCurrentUser())) await loadInvitationSetup();
  } catch {
    clearSignedInUser();
    showNotice("FriendlyFive could not check your session. Sign in to continue.", "error");
  } finally {
    initializing.value = false;
  }
}

onMounted(loadCurrentUser);
watch(invitationToken, () => loadInvitationSetup());
</script>

<template>
  <main class="page-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <header v-if="signedIn" class="site-header">
      <RouterLink class="brand" :to="{ name: 'home' }" aria-label="FriendlyFive home">
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="16" fill="#285a7a" />
          <circle cx="20" cy="20" r="6" fill="#fffdf8" />
          <circle cx="44" cy="20" r="6" fill="#fffdf8" />
          <circle cx="32" cy="32" r="6" fill="#fffdf8" />
          <circle cx="20" cy="44" r="6" fill="#fffdf8" />
          <circle cx="44" cy="44" r="6" fill="#fffdf8" />
        </svg>
        FriendlyFive
      </RouterLink>
      <div v-if="signedIn" class="account-navigation">
        <span class="signed-in-name">{{ signedInUsername }}</span>
        <button class="text-button" type="button" :disabled="submitting" @click="signOut">
          {{ submitting ? "Signing out…" : "Sign out" }}
        </button>
      </div>
    </header>

    <div id="main-content" ref="mainContent" tabindex="-1">
      <section v-if="initializing" class="welcome-card account-card" aria-labelledby="loading-heading" role="status">
        <p class="eyebrow">FriendlyFive</p>
        <h1 id="loading-heading">Checking your session…</h1>
      </section>

      <RouterView v-else-if="signedIn" />

      <section v-else class="auth-layout" aria-labelledby="welcome-heading">
        <div class="auth-introduction">
          <template v-if="invitationSetup">
            <p class="eyebrow">Agreement invitation</p>
            <h1 id="welcome-heading">{{ invitationSetup.initiatorUsername }} invited you to FriendlyFive.</h1>
            <p class="intro" v-if="invitationSetup.requiresRegistration">
              Create an account for <strong>{{ invitationSetup.counterpartEmail }}</strong> and choose
              your own username. The invitation will open automatically afterward.
            </p>
            <p class="intro" v-else>
              Sign in as <strong>{{ invitationSetup.counterpartUsername }}</strong> to review the proposal.
            </p>
          </template>
          <template v-else>
            <p class="eyebrow">Clear terms. Friendly outcomes.</p>
            <div class="hero-title">
              <svg class="hero-mark" viewBox="0 0 64 64" aria-hidden="true">
                <rect width="64" height="64" rx="16" fill="#285a7a" />
                <circle cx="20" cy="20" r="6" fill="#fffdf8" />
                <circle cx="44" cy="20" r="6" fill="#fffdf8" />
                <circle cx="32" cy="32" r="6" fill="#fffdf8" />
                <circle cx="20" cy="44" r="6" fill="#fffdf8" />
                <circle cx="44" cy="44" r="6" fill="#fffdf8" />
              </svg>
              <h1 id="welcome-heading">FriendlyFive</h1>
            </div>
            <p class="intro">
              FriendlyFive records an agreement, helps resolve its outcome, and tracks
              the resulting obligation. Payments stay between you and your friend.
            </p>
          </template>
        </div>

        <div class="auth-card">
          <div class="auth-switcher" aria-label="Account action">
            <button type="button" :class="{ active: mode === 'sign-in' }" :aria-pressed="mode === 'sign-in'" @click="selectMode('sign-in')">
              Sign in
            </button>
            <button type="button" :class="{ active: mode === 'register' }" :aria-pressed="mode === 'register'" @click="selectMode('register')">
              Register
            </button>
          </div>

          <div class="form-heading">
            <h2>{{ mode === "sign-in" ? "Welcome back" : "Create an account" }}</h2>
            <p>{{ mode === "sign-in" ? "Enter the credentials for your FriendlyFive account." : "Choose the credentials you will use to return." }}</p>
          </div>

          <form class="auth-form" @submit.prevent="submitAuthentication">
          <label for="username">Username</label>
          <input id="username" v-model="username" name="username" type="text" autocomplete="username" required :disabled="submitting" />

          <template v-if="mode === 'register'">
            <label for="email">Email</label>
            <input
              id="email"
              v-model="email"
              name="email"
              type="email"
              autocomplete="email"
              required
              :readonly="invitationSetup?.requiresRegistration"
              :disabled="submitting"
            />
          </template>

          <label for="password">Password</label>
          <div class="password-field">
            <input
              id="password"
              ref="passwordInput"
              v-model="password"
              name="password"
              :type="showPassword ? 'text' : 'password'"
              :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
              required
              :disabled="submitting"
            />
            <button
              class="password-toggle"
              type="button"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              :aria-pressed="showPassword"
              :disabled="submitting"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? "Hide" : "Show" }}
            </button>
          </div>

          <p v-if="notice" class="notice" :class="`notice-${noticeKind}`" role="status" aria-live="polite">
            {{ notice }}
          </p>

          <button class="button button-primary" type="submit" :disabled="submitting">
            {{ submitting ? (mode === "sign-in" ? "Signing in…" : "Creating account…") : (mode === "sign-in" ? "Sign in" : "Create account") }}
          </button>
          </form>
        </div>
      </section>
    </div>
  </main>
</template>
