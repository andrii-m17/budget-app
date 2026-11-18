// Стани для знімків і перевірки на 320 pt (DS-4d2): виконуються у сторінці через page.evaluate
// стан → { open у сторінці, що знімати (селектор) }
const STATES = {
  settings: { sel: '#settings-drawer', open: () => { openSettings(); } },
  card: { sel: '#card-debt-drawer', open: () => { switchTab('accounting'); openCardDebtEditor(0); } },
  income: { sel: '#income-drawer', open: () => { switchTab('accounting'); openIncomeEditor(0); } },
  login: { sel: '#profile-drawer', open: () => { showProfileLoginForm(); } },
  struct: { sel: '#struct-drawer', open: () => { switchTab('structure'); showCategoryModal('Категорія', 'Тест', CATEGORY_TYPES[0], function(){}, function(){}); } },
  mono: { sel: '#mono-detail-drawer', open: async () => { await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); } },
  'modal-input': { sel: '#app-modal', open: () => { showInstallmentModal('Додати банк', '', '', function(){ return true; }, 'Ліміт'); } },
  'modal-confirm': { sel: '#app-modal', open: () => { showConfirmModal('Видалити запис? Це не можна скасувати.', function(){}, 'Видалити'); } },
  'modal-month': { sel: '#app-modal', open: () => { showMonthPickerModal('Приховати з місяця', ['2026-11', '2026-10'], '2026-11', function(){}); } },
  notifications: { sel: '#notifications-drawer', open: async () => { await openNotificationsDrawer(); } },
  expense: { sel: 'body', open: () => { switchTab('vytraty'); } }
};
const GROUPS = {
  headers: ['settings', 'card', 'income'],
  fields: ['card', 'income', 'login'],
  struct: ['struct', 'mono'],
  appmodal: ['modal-input', 'modal-confirm', 'modal-month'],
  notifications: ['notifications'],
  expense: ['expense']
};
module.exports = { STATES, GROUPS };
