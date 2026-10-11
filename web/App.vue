<script setup lang="ts">
import { api } from "./api.ts";

// Importing the generated client here keeps the shell connected to the same
// endpoint contract the backend exposes. Forms begin using it in the next step.
void api;
</script>

<template>
  <main class="page-shell">
    <header class="site-header">
      <a class="brand" href="/" aria-label="FriendlyFive home">FriendlyFive</a>
      <span class="milestone">P2 MVP</span>
    </header>

    <section class="welcome-card" aria-labelledby="welcome-heading">
      <p class="eyebrow">Clear terms. Friendly outcomes.</p>
      <h1 id="welcome-heading">Keep the bet clear between friends.</h1>
      <p class="intro">
        FriendlyFive records an agreement, helps resolve its outcome, and tracks
        the resulting obligation. Payments stay between you and your friend.
      </p>

      <div class="shell-status" role="status">
        <span class="status-dot" aria-hidden="true"></span>
        <span>The application shell is ready. Account setup comes next.</span>
      </div>
    </section>
  </main>
</template>
