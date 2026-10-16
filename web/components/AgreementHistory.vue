<script setup lang="ts">
type AgreementVersion = {
  version: string;
  number: number;
  author: string;
  authorUsername: string;
  claim: string;
  deadline: string;
  initiatorStake: string;
  counterpartStake: string;
  exceptions: string;
  resolutionRule: string;
  resolver: string | null;
  resolverUsername: string | null;
};

defineProps<{
  versions: AgreementVersion[];
  currentVersion: string;
  initiatorUsername: string;
  counterpartUsername: string;
}>();

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
</script>

<template>
  <section v-if="versions.length > 0" class="history-card" aria-labelledby="agreement-history-heading">
    <div class="history-heading">
      <div>
        <p class="eyebrow">Record of changes</p>
        <h2 id="agreement-history-heading">Agreement history</h2>
      </div>
      <span>{{ versions.length }} {{ versions.length === 1 ? "version" : "versions" }}</span>
    </div>

    <ol class="history-list">
      <li v-for="version in versions" :key="version.version" class="history-entry">
        <div class="history-marker" aria-hidden="true">{{ version.number }}</div>
        <div class="history-content">
          <div class="history-entry-heading">
            <h3>Version {{ version.number }} by {{ version.authorUsername }}</h3>
            <span v-if="version.version === currentVersion" class="current-label">Current</span>
          </div>
          <p class="report-meta">Resolution cutoff {{ formatDate(version.deadline) }}</p>
          <p class="history-claim">{{ version.claim }}</p>

          <details class="history-details">
            <summary>Review these terms</summary>
            <dl>
              <div>
                <dt>{{ initiatorUsername }} owes if false</dt>
                <dd>{{ version.initiatorStake }}</dd>
              </div>
              <div>
                <dt>{{ counterpartUsername }} owes if true</dt>
                <dd>{{ version.counterpartStake }}</dd>
              </div>
              <div>
                <dt>Decision rule</dt>
                <dd>{{ version.resolutionRule }}</dd>
              </div>
              <div v-if="version.exceptions">
                <dt>Exceptions</dt>
                <dd>{{ version.exceptions }}</dd>
              </div>
              <div>
                <dt>Resolver</dt>
                <dd>{{ version.resolverUsername ?? "None" }}</dd>
              </div>
            </dl>
          </details>
        </div>
      </li>
    </ol>
  </section>
</template>
