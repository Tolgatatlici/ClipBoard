/** Yayına özel bilgiler; derleme sırasında ortam değişkenleriyle ayarlanır. */
export const SITE = {
  name: 'ClipBoard',
  /** İşletmecinin (gerçek ya da tüzel kişi) adı; yasal metinlerde kullanılır. */
  operator: (import.meta.env.VITE_OPERATOR_NAME as string | undefined) || '[İşletmeci adı]',
  contactEmail:
    (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || 'iletisim@example.com',
  /** Yasal metinlerin son güncellenme tarihi. */
  legalUpdated: '27 Eylül 2026',
};
