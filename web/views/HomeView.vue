<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
  <section class="page-content welcome-card dashboard-card" aria-labelledby="home-heading">
    <p class="eyebrow">FriendlyFive</p>
    <h1 id="home-heading">Make the terms clear before the bet begins.</h1>
    <p class="intro">
      Create a two-person agreement, record what each side owes, and decide how the
      outcome will be resolved.
    </p>
    <RouterLink class="button button-primary button-link" :to="{ name: 'agreement-new' }">
      New agreement
    </RouterLink>
  </section>
</template>
