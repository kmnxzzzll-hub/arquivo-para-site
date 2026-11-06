// Configuração pública (sem segredos).
export const USERNAME_DOMAIN = "bacbolive.local";
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
export const DEFAULT_WHATSAPP = "244956125296";
export const WHATSAPP_MESSAGE =
  "Olá! Gostaria de solicitar acesso à plataforma Bac Bo Live.\nPodem informar-me como obter as minhas credenciais de acesso?\nObrigado!";
export const whatsappUrl = (num: string) =>
  `https://wa.me/${num.replace(/\D/g, "")}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;
/** Valor inicial de «Ganhos totais» (Kz); o administrador altera-o nas Definições. */
export const DEFAULT_TOTAL_GAINS = "10897363";
/** Formata um valor inteiro em Kz com espaços entre milhares, ex.: "10 897 363 Kz". */
export const formatKz = (digits: string) => `${digits.replace(/\D/g, "").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, "\u202F")} Kz`;
export const LOGIN_MAX_FAILS = 5;
export const LOGIN_WINDOW_MIN = 15;
