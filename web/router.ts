import { createRouter, createWebHistory } from "vue-router";
import AgreementInvitationView from "./views/AgreementInvitationView.vue";
import HomeView from "./views/HomeView.vue";
import NewAgreementView from "./views/NewAgreementView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/agreements/new", name: "agreement-new", component: NewAgreementView },
    {
      path: "/agreements/invite/:token",
      name: "agreement-invite",
      component: AgreementInvitationView,
    },
  ],
});
