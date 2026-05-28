/**
 * app.js
 * Main application logic for the Vault Expense Tracker.
 * Depends on window.VaultUtils and window.VaultStorage.
 */

(function() {
  'use strict';

  var Utils = window.VaultUtils;
  var Storage = window.VaultStorage;

  // --- State ---
  var activeData = Storage.loadData();
  var currentView = 'view-dashboard';
  var undoTimeout = null;
  var deletedTxBackup = null;

  // --- DOM Refs (populated after DOMContentLoaded) ---
  var views, navBtns;
  var dashNet, dashIncome, dashExpense;
  var dashBudgetFill, dashBudgetText, dashBudgetWarning;
  var dashCategoriesList, trendSvg;
  var txListContainer, filterSearch, filterType, filterSort;
  var modalBackdrop, txForm, btnFab, btnModalClose, btnModalCancel;
  var toastContainer;
  var settingsForm, settingCurrency, budgetForm, settingBudget;
  var btnExport, btnImport, btnReset;

  // =============================================
  //  INIT
  // =============================================
  function init() {
    // Cache all DOM refs
    views = document.querySelectorAll('.view');
    navBtns = document.querySelectorAll('.nav-btn');

    dashNet = document.getElementById('dash-net');
    dashIncome = document.getElementById('dash-income');
    dashExpense = document.getElementById('dash-expense');
    dashBudgetFill = document.getElementById('dash-budget-fill');
    dashBudgetText = document.getElementById('dash-budget-text');
    dashBudgetWarning = document.getElementById('dash-budget-warning');
    dashCategoriesList = document.getElementById('dash-categories-list');
    trendSvg = document.getElementById('trend-svg');

    txListContainer = document.getElementById('transactions-list-container');
    filterSearch = document.getElementById('filter-search');
    filterType = document.getElementById('filter-type');
    filterSort = document.getElementById('filter-sort');

    modalBackdrop = document.getElementById('tx-modal-backdrop');
    txForm = document.getElementById('tx-form');
    btnFab = document.getElementById('fab-add');
    btnModalClose = document.getElementById('modal-close');
    btnModalCancel = document.getElementById('modal-cancel');
    toastContainer = document.getElementById('toast-container');

    settingsForm = document.getElementById('settings-form');
    settingCurrency = document.getElementById('setting-currency');
    budgetForm = document.getElementById('budget-form');
    settingBudget = document.getElementById('setting-budget');
    btnExport = document.getElementById('btn-export');
    btnImport = document.getElementById('btn-import');
    btnReset = document.getElementById('btn-reset');

    bindNavigation();
    bindForms();
    bindFilters();
    bindSettingsData();

    renderAll();
  }

  function renderAll() {
    activeData = Storage.loadData();
    renderDashboard();
    renderTransactions();
  }

  // =============================================
  //  NAVIGATION
  // =============================================
  function bindNavigation() {
    navBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var targetId = e.currentTarget.dataset.target;
        switchView(targetId);
        navBtns.forEach(function(b) { b.classList.remove('active'); });
        e.currentTarget.classList.add('active');
      });
    });
  }

  function switchView(viewId) {
    currentView = viewId;
    views.forEach(function(view) {
      if (view.id === viewId) {
        view.classList.add('view-active');
        view.removeAttribute('hidden');
      } else {
        view.classList.remove('view-active');
        view.setAttribute('hidden', 'true');
      }
    });
    if (viewId === 'view-dashboard') renderDashboard();
    if (viewId === 'view-transactions') renderTransactions();
  }

  // =============================================
  //  DASHBOARD
  // =============================================
  function renderDashboard() {
    var txs = activeData.transactions;
    var today = new Date();
    var currentMonth = today.getMonth();
    var currentYear = today.getFullYear();

    var income = 0;
    var expense = 0;
    var categoryTotals = {};
    var dailySpendMap = {};

    txs.forEach(function(tx) {
      var txD = tx.date.split('-');
      var m = parseInt(txD[1], 10) - 1;
      var y = parseInt(txD[0], 10);

      if (m === currentMonth && y === currentYear) {
        if (tx.type === 'income') {
          income += tx.amount;
        } else {
          expense += tx.amount;
          var cat = Utils.escapeHTML(tx.category) || 'Other';
          categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.amount;
          var dayStr = txD[2];
          dailySpendMap[dayStr] = (dailySpendMap[dayStr] || 0) + tx.amount;
        }
      }
    });

    var net = income - expense;
    var cur = activeData.settings.currency;

    dashNet.textContent = Utils.formatCurrency(net, cur);
    dashNet.className = 'amount ' + (net >= 0 ? 'positive' : 'negative');
    dashIncome.textContent = Utils.formatCurrency(income, cur);
    dashExpense.textContent = Utils.formatCurrency(expense, cur);

    renderBudgetWidget(expense);
    renderCategoryList(categoryTotals);
    renderTrendSvg(dailySpendMap, currentYear, currentMonth);
  }

  function renderBudgetWidget(currentExpense) {
    var target = activeData.budget;
    if (!target || target <= 0) {
      dashBudgetText.textContent = 'No budget set. Go to Settings to set one.';
      dashBudgetFill.style.width = '0%';
      dashBudgetWarning.hidden = true;
      return;
    }

    var perc = Math.min(100, Math.round((currentExpense / target) * 100));
    var cur = activeData.settings.currency;
    dashBudgetText.textContent = Utils.formatCurrency(currentExpense, cur) + ' / ' + Utils.formatCurrency(target, cur) + ' (' + perc + '%)';
    dashBudgetFill.style.width = perc + '%';

    dashBudgetFill.className = 'progress-bar-fill';
    dashBudgetWarning.hidden = true;

    if (perc >= 100) {
      dashBudgetFill.classList.add('danger');
      dashBudgetWarning.textContent = '⚠ Budget exceeded!';
      dashBudgetWarning.className = 'text-small text-error mt-1';
      dashBudgetWarning.hidden = false;
    } else if (perc >= 80) {
      dashBudgetFill.classList.add('warning');
      dashBudgetWarning.textContent = '⚠ Approaching budget limit.';
      dashBudgetWarning.className = 'text-small text-warning mt-1';
      dashBudgetWarning.hidden = false;
    }
  }

  function renderCategoryList(catObj) {
    dashCategoriesList.innerHTML = '';
    var sorted = Object.entries(catObj).sort(function(a, b) { return b[1] - a[1]; });

    if (sorted.length === 0) {
      var emptyLi = document.createElement('li');
      emptyLi.className = 'empty-state text-muted';
      emptyLi.textContent = 'No expenses this month.';
      dashCategoriesList.appendChild(emptyLi);
      return;
    }

    sorted.slice(0, 5).forEach(function(entry) {
      var cat = entry[0];
      var val = entry[1];
      var li = document.createElement('li');
      li.className = 'cat-row';

      var spanCat = document.createElement('span');
      spanCat.textContent = cat;
      var spanVal = document.createElement('span');
      spanVal.className = 'font-mono';
      spanVal.textContent = Utils.formatCurrency(val, activeData.settings.currency);

      li.appendChild(spanCat);
      li.appendChild(spanVal);
      dashCategoriesList.appendChild(li);
    });
  }

  function renderTrendSvg(dailyMap, year, month) {
    // Clear SVG using DOM API instead of innerHTML
    while (trendSvg.firstChild) {
      trendSvg.removeChild(trendSvg.firstChild);
    }

    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var dataPoints = [];
    var maxSpend = 0;

    for (var d = 1; d <= daysInMonth; d++) {
      var dStr = d.toString().padStart(2, '0');
      var val = dailyMap[dStr] || 0;
      maxSpend = Math.max(maxSpend, val);
      dataPoints.push({ d: d, val: val });
    }

    if (maxSpend === 0) {
      var textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', '50%');
      textEl.setAttribute('y', '50%');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('fill', '#6e6e6e');
      textEl.setAttribute('font-size', '14px');
      textEl.textContent = 'No spend data this month';
      trendSvg.appendChild(textEl);
      return;
    }

    var width = trendSvg.clientWidth || 300;
    var height = 200;
    var padding = 20;
    var dRangeX = width / Math.max(daysInMonth - 1, 1);
    var dRangeY = (height - padding * 2) / maxSpend;

    var pathD = '';
    var lastX = 0;
    dataPoints.forEach(function(pt, i) {
      var x = i * dRangeX;
      var y = height - padding - (pt.val * dRangeY);
      lastX = x;
      if (i === 0) {
        pathD += 'M ' + x + ' ' + y + ' ';
      } else {
        pathD += 'L ' + x + ' ' + y + ' ';
      }
    });

    // Area fill
    var areaD = pathD + 'L ' + lastX + ' ' + (height - padding) + ' L 0 ' + (height - padding) + ' Z';
    var areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    areaPath.setAttribute('d', areaD);
    areaPath.setAttribute('fill', 'rgba(59, 130, 246, 0.15)');
    trendSvg.appendChild(areaPath);

    // Line stroke
    var linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    linePath.setAttribute('d', pathD);
    linePath.setAttribute('fill', 'none');
    linePath.setAttribute('stroke', '#3b82f6');
    linePath.setAttribute('stroke-width', '2.5');
    trendSvg.appendChild(linePath);
  }

  // =============================================
  //  TRANSACTIONS LIST
  // =============================================
  function bindFilters() {
    filterSearch.addEventListener('input', renderTransactions);
    filterType.addEventListener('change', renderTransactions);
    filterSort.addEventListener('change', renderTransactions);
  }

  function renderTransactions() {
    var txs = activeData.transactions.slice();
    var term = filterSearch.value.trim().toLowerCase();
    var tType = filterType.value;
    var sort = filterSort.value;

    var filtered = txs.filter(function(tx) {
      if (tType !== 'all' && tx.type !== tType) return false;
      if (term) {
        var matchNote = (tx.note || '').toLowerCase().indexOf(term) !== -1;
        var matchCat = (tx.category || '').toLowerCase().indexOf(term) !== -1;
        if (!matchNote && !matchCat) return false;
      }
      return true;
    });

    filtered.sort(function(a, b) {
      if (sort === 'date-desc') return new Date(b.date) - new Date(a.date);
      if (sort === 'date-asc') return new Date(a.date) - new Date(b.date);
      if (sort === 'amount-desc') return b.amount - a.amount;
      if (sort === 'amount-asc') return a.amount - b.amount;
      return 0;
    });

    txListContainer.innerHTML = '';

    if (filtered.length === 0) {
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state p-2';
      emptyDiv.textContent = txs.length === 0 ? 'No transactions yet. Tap + to add one!' : 'No matching transactions.';
      txListContainer.appendChild(emptyDiv);
      return;
    }

    var currentGroupDate = null;
    var groupWrapper = null;

    filtered.forEach(function(tx) {
      if (tx.date !== currentGroupDate) {
        currentGroupDate = tx.date;
        groupWrapper = document.createElement('div');
        groupWrapper.className = 'tx-day-group';

        var head = document.createElement('div');
        head.className = 'tx-day-header';
        head.textContent = Utils.friendlyDate(tx.date);
        groupWrapper.appendChild(head);
        txListContainer.appendChild(groupWrapper);
      }

      var row = document.createElement('div');
      row.className = 'tx-item';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'Edit transaction: ' + tx.category + ' ' + tx.amount);

      // Closure to capture tx
      (function(t) {
        row.addEventListener('click', function() { openModal(t); });
        row.addEventListener('keydown', function(e) { if (e.key === 'Enter') openModal(t); });
      })(tx);

      var mainInfo = document.createElement('div');
      mainInfo.className = 'tx-main-info';

      var catDiv = document.createElement('div');
      catDiv.className = 'tx-cat';
      catDiv.textContent = tx.category;
      mainInfo.appendChild(catDiv);

      if (tx.note) {
        var noteDiv = document.createElement('div');
        noteDiv.className = 'tx-note';
        noteDiv.textContent = tx.note;
        mainInfo.appendChild(noteDiv);
      }

      var amtInfo = document.createElement('div');
      amtInfo.className = 'tx-amount-info';
      var amtDiv = document.createElement('div');
      amtDiv.className = 'tx-val ' + tx.type;
      var prefix = tx.type === 'expense' ? '-' : '+';
      amtDiv.textContent = prefix + Utils.formatCurrency(tx.amount, activeData.settings.currency);
      amtInfo.appendChild(amtDiv);

      if (tx.paymentMethod) {
        var pmDiv = document.createElement('div');
        pmDiv.className = 'tx-note text-xs';
        pmDiv.textContent = tx.paymentMethod;
        amtInfo.appendChild(pmDiv);
      }

      row.appendChild(mainInfo);
      row.appendChild(amtInfo);
      groupWrapper.appendChild(row);
    });
  }

  // =============================================
  //  MODAL & CRUD
  // =============================================
  function bindForms() {
    btnFab.addEventListener('click', function() { openModal(null); });
    btnModalClose.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); closeModal(); });
    btnModalCancel.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); closeModal(); });

    // Click on backdrop (outside the modal container) closes modal
    modalBackdrop.addEventListener('click', function(e) {
      if (e.target === modalBackdrop) {
        closeModal();
      }
    });

    // Radio card visual toggle
    var radioCards = document.querySelectorAll('.radio-card');
    radioCards.forEach(function(card) {
      card.addEventListener('click', function(e) {
        // Find the radio inside this card and select it
        var radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          // Update visual states
          radioCards.forEach(function(c) { c.classList.remove('active'); });
          card.classList.add('active');
        }
      });
    });

    // Form submit
    txForm.addEventListener('submit', function(e) {
      e.preventDefault();
      saveTransactionForm();
    });

    // ESC to close modal
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && !modalBackdrop.hasAttribute('hidden')) {
        closeModal();
      }
    });
  }

  function openModal(tx) {
    modalBackdrop.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';

    var titleEl = document.getElementById('tx-modal-title');
    var idField = document.getElementById('tx-id');
    var amountField = document.getElementById('tx-amount');
    var dateField = document.getElementById('tx-date');
    var categoryField = document.getElementById('tx-category');
    var noteField = document.getElementById('tx-note');
    var paymentField = document.getElementById('tx-payment');
    var radioCards = txForm.querySelectorAll('.radio-card');

    if (tx) {
      // EDIT mode
      titleEl.textContent = 'Edit Transaction';
      idField.value = tx.id;
      amountField.value = tx.amount;
      dateField.value = tx.date;
      categoryField.value = tx.category;
      noteField.value = tx.note || '';
      paymentField.value = tx.paymentMethod || '';

      // Set radio
      var radio = txForm.querySelector('input[name="tx-type"][value="' + tx.type + '"]');
      if (radio) {
        radio.checked = true;
        radioCards.forEach(function(c) { c.classList.remove('active'); });
        radio.parentElement.classList.add('active');
      }

      // Add or update Delete button
      var existingDel = document.getElementById('btn-modal-delete');
      if (existingDel) existingDel.remove();

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.id = 'btn-modal-delete';
      delBtn.className = 'btn btn-destructive';
      delBtn.style.marginRight = 'auto';
      delBtn.textContent = 'Delete';
      (function(t) {
        delBtn.addEventListener('click', function() { handleDelete(t); });
      })(tx);
      document.querySelector('.modal-actions').prepend(delBtn);

    } else {
      // ADD mode
      titleEl.textContent = 'Add Transaction';
      txForm.reset();
      idField.value = '';

      // Default to Expense
      var expenseRadio = txForm.querySelector('input[name="tx-type"][value="expense"]');
      if (expenseRadio) expenseRadio.checked = true;
      radioCards.forEach(function(c) { c.classList.remove('active'); });
      if (expenseRadio) expenseRadio.parentElement.classList.add('active');

      // Set date to today
      dateField.value = Utils.getTodayStr();

      // Remove any leftover delete button
      var existingDel2 = document.getElementById('btn-modal-delete');
      if (existingDel2) existingDel2.remove();
    }

    // Focus the amount field for quick entry
    setTimeout(function() { amountField.focus(); amountField.select(); }, 100);
  }

  function closeModal() {
    modalBackdrop.setAttribute('hidden', 'true');
    document.body.style.overflow = '';
    if (btnFab) btnFab.focus();
  }

  function saveTransactionForm() {
    var idField = document.getElementById('tx-id');
    var id = idField.value;
    var isEditing = id !== '';

    var amountVal = Utils.parseAmount(document.getElementById('tx-amount').value);
    var dateVal = document.getElementById('tx-date').value;
    var categoryVal = document.getElementById('tx-category').value.trim();
    var typeRadio = txForm.querySelector('input[name="tx-type"]:checked');

    // Manual validation
    if (!typeRadio) { showToast('Please select a type.'); return; }
    if (amountVal <= 0) { showToast('Amount must be greater than 0.'); return; }
    if (!dateVal) { showToast('Please select a date.'); return; }
    if (!categoryVal) { showToast('Category is required.'); return; }

    var txData = {
      id: isEditing ? id : Utils.generateId(),
      type: typeRadio.value,
      amount: amountVal,
      date: dateVal,
      category: categoryVal,
      note: document.getElementById('tx-note').value.trim(),
      paymentMethod: document.getElementById('tx-payment').value.trim(),
      updatedAt: new Date().toISOString()
    };

    if (!isEditing) {
      txData.createdAt = txData.updatedAt;
      Storage.saveTransaction(txData);
      showToast('Transaction added!');
    } else {
      var cur = activeData.transactions.find(function(t) { return t.id === id; });
      if (cur) txData.createdAt = cur.createdAt;
      Storage.updateTransaction(txData);
      showToast('Transaction updated!');
    }

    closeModal();
    renderAll();
  }

  function handleDelete(tx) {
    deletedTxBackup = tx;
    Storage.deleteTransaction(tx.id);
    closeModal();
    renderAll();
    showUndoToast('Transaction deleted.');
  }

  // =============================================
  //  TOASTS
  // =============================================
  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'toast';
    var span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);
    toastContainer.appendChild(toast);

    setTimeout(function() {
      toast.classList.add('hiding');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  }

  function showUndoToast(msg) {
    if (undoTimeout) clearTimeout(undoTimeout);
    toastContainer.innerHTML = '';

    var toast = document.createElement('div');
    toast.className = 'toast';

    var span = document.createElement('span');
    span.textContent = msg;
    toast.appendChild(span);

    var undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = 'UNDO';
    undoBtn.addEventListener('click', function() {
      if (deletedTxBackup) {
        Storage.saveTransaction(deletedTxBackup);
        deletedTxBackup = null;
        renderAll();
        toast.classList.add('hiding');
        setTimeout(function() { toast.remove(); }, 300);
        clearTimeout(undoTimeout);
      }
    });
    toast.appendChild(undoBtn);
    toastContainer.appendChild(toast);

    undoTimeout = setTimeout(function() {
      toast.classList.add('hiding');
      setTimeout(function() { toast.remove(); }, 300);
      deletedTxBackup = null;
    }, 5000);
  }

  // =============================================
  //  SETTINGS & DATA TOOLS
  // =============================================
  function bindSettingsData() {
    settingCurrency.value = activeData.settings.currency || '₹';
    settingBudget.value = activeData.budget || '';

    settingsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var cur = settingCurrency.value.trim() || '₹';
      Storage.saveSettings({ currency: cur });
      showToast('Settings saved!');
      renderAll();
    });

    budgetForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var amount = settingBudget.value;
      Storage.saveBudget(amount);
      showToast('Budget saved!');
      renderAll();
    });

    btnExport.addEventListener('click', function() {
      var csv = Storage.generateCSV();
      if (!csv) { showToast('No data to export.'); return; }
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'vault-export-' + Utils.getTodayStr() + '.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('CSV exported!');
    });

    btnImport.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(event) {
        var res = Storage.importFromJSON(event.target.result);
        showToast(res.message);
        if (res.success) renderAll();
        e.target.value = '';
      };
      reader.readAsText(file);
    });

    btnReset.addEventListener('click', function() {
      if (confirm('Are you sure? This will permanently delete ALL your data.')) {
        Storage.factoryReset();
        showToast('All data has been reset.');
        activeData = Storage.loadData();
        renderAll();
        settingCurrency.value = '₹';
        settingBudget.value = '';
      }
    });
  }

  // =============================================
  //  BOOT
  // =============================================
  document.addEventListener('DOMContentLoaded', init);

  window.addEventListener('resize', function() {
    if (currentView === 'view-dashboard') renderDashboard();
  });

})();
