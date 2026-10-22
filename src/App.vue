<script setup lang="ts">
import MainLayout from './components/MainLayout.vue';
import { Pages, useGlobalState } from './composables/app-state';
import HomeView from './pages/HomeView.vue';
import QueueView from './pages/QueueView.vue';
import SettingsView from './pages/SettingsView.vue';

const { page } = useGlobalState();
</script>

<template>
  <MainLayout>
    <Transition name="page" mode="out-in">
      <HomeView v-if="page === Pages.HOME" />
      <QueueView v-else-if="page === Pages.QUEUE" />
      <SettingsView v-else-if="page === Pages.SETTINGS" />
      <HomeView v-else />
    </Transition>
  </MainLayout>
</template>
