let userAccounts = [];
let userCards = [];
let userTransactions = [];
let userBills = [];
let userLoans = [];
let selectedAccount = null;
let selectedBill = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadUserData();
    loadAccountsAndCards();
    loadTransactions();
    loadProfileSettings();
    loadBills();
    loadLoans();
    setupBillsEventListeners();
    setupLoanEventListeners();
    setupEventListeners();
});

function setupEventListeners() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section');
    const pageTitle = document.getElementById('page-title');
    const transferForm = document.getElementById('transfer-form');
    const logoutBtn = document.getElementById('logout-btn');

    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionId = this.getAttribute('data-section');
            
            navButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            sections.forEach(section => section.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
            
            updatePageTitle(sectionId);
            
            if (sectionId === 'analytics') {
                initCharts();
            }
            if (sectionId === 'accounts') {
                updateAccountsPage();
            }
            if (sectionId === 'transactions') {
                updateTransactionsPage();
            }
            if (sectionId === 'bills') {
                loadBills();
            }
            if (sectionId === 'loans') {
                loadLoans();
            }
        });
    });

    function updatePageTitle(sectionId) {
        const titles = {
            dashboard: 'Dashboard',
            accounts: 'Your Accounts',
            cards: 'Your Cards',
            bills: 'Pay Bills',
            transfer: 'Send Money',
            transactions: 'Transaction History',
            loans: 'Loan Services',
            analytics: 'Financial Analytics',
            settings: 'Settings'
        };
        pageTitle.textContent = titles[sectionId] || 'Dashboard';
    }

    transferForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const fromAccount = document.getElementById('from-account').value;
        const recipientName = document.getElementById('recipient-name').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const description = document.getElementById('description').value || `Transfer to ${recipientName}`;
        
        const token = getToken();
        const accountMatch = userAccounts.find(a => a.name === fromAccount.split('(')[0].trim());
        
        if (!accountMatch) {
            alert('Account not found');
            return;
        }
        
        fetch('/api/transfer', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from_account_id: accountMatch.id,
                amount: amount,
                description: description
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                const successMessage = document.getElementById('transfer-success');
                const successDetails = document.getElementById('success-details');
                
                successDetails.innerHTML = `<p><strong>৳${amount.toFixed(2)}</strong> transferred to <strong>${recipientName}</strong> from <strong>${fromAccount}</strong></p>`;
                
                transferForm.style.display = 'none';
                successMessage.classList.remove('hidden');
                
                loadAccountsAndCards();
                loadTransactions();
            } else {
                alert('Transfer failed: ' + data.message);
            }
        })
        .catch(err => alert('Error: ' + err.message));
    });

    logoutBtn.addEventListener('click', function() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    });
}

function setupLoanEventListeners() {
    const loanForm = document.getElementById('loan-form');
    if (loanForm) {
        loanForm.addEventListener('submit', function(e) {
            e.preventDefault();
            applyLoan();
        });
    }
}

function loadLoans() {
    const token = getToken();
    fetch('/api/loans', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            userLoans = data.loans;
            displayLoans();
        }
    })
    .catch(err => {});
}

function displayLoans() {
    const container = document.getElementById('loans-list');
    const statusElement = document.getElementById('loans-status');
    
    if (userLoans.length === 0) {
        statusElement.textContent = 'No active loans';
        container.innerHTML = '';
        return;
    }
    
    statusElement.textContent = `${userLoans.length} active loan(s)`;
    let totalAmount = 0;
    let totalMonthly = 0;
    
    container.innerHTML = userLoans.map(loan => {
        totalAmount += loan.principal_amount;
        totalMonthly += loan.monthly_payment;
        const progressPercent = ((loan.principal_amount - loan.remaining_amount) / loan.principal_amount) * 100;
        
        return `
            <div class="loan-card">
                <div class="loan-header">
                    <h4>${loan.loan_type.charAt(0).toUpperCase() + loan.loan_type.slice(1)} Loan</h4>
                    <span class="loan-status ${loan.status}">${loan.status.toUpperCase()}</span>
                </div>
                <div class="loan-details">
                    <div class="loan-detail-item">
                        <span>Principal Amount</span>
                        <span>৳${loan.principal_amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="loan-detail-item">
                        <span>Remaining Balance</span>
                        <span>৳${loan.remaining_amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                    <div class="loan-detail-item">
                        <span>Interest Rate</span>
                        <span>${loan.interest_rate}% p.a.</span>
                    </div>
                    <div class="loan-detail-item">
                        <span>Monthly Payment</span>
                        <span>৳${loan.monthly_payment.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    </div>
                </div>
                <div class="loan-progress">
                    <div class="progress-label">
                        <span>Progress</span>
                        <span>${Math.round(progressPercent)}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressPercent}%;"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function applyLoan() {
    const loanType = document.getElementById('loan-type').value;
    const loanAmount = parseFloat(document.getElementById('loan-amount').value);
    const tenure = parseInt(document.getElementById('loan-tenure').value);
    const token = getToken();
    
    if (!loanAmount || loanAmount <= 0) {
        alert('Please enter a valid loan amount');
        return;
    }
    
    fetch('/api/apply-loan', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            loan_type: loanType,
            principal_amount: loanAmount,
            tenure_months: tenure
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Loan application successful!');
            document.getElementById('loan-form').reset();
            loadLoans();
        } else {
            alert('Loan application failed: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function setupBillsEventListeners() {
    const billSelector = document.getElementById('bill-selector');
    const paymentAmount = document.getElementById('payment-amount');
    const billForm = document.getElementById('bill-payment-form');
    
    if (billSelector) {
        billSelector.addEventListener('change', function() {
            const billId = this.value;
            selectedBill = userBills.find(b => b.id === billId);
            if (selectedBill) {
                document.getElementById('bill-details').innerHTML = `
                    <div><strong>Biller:</strong> ${selectedBill.biller_name}</div>
                    <div><strong>Amount:</strong> ৳${selectedBill.amount.toFixed(2)}</div>
                    <div><strong>Category:</strong> ${selectedBill.category}</div>
                    <div><strong>Due Date:</strong> ${new Date(selectedBill.due_date).toLocaleDateString()}</div>
                `;
                paymentAmount.value = selectedBill.amount.toFixed(2);
            }
        });
    }

    if (billForm) {
        billForm.addEventListener('submit', function(e) {
            e.preventDefault();
            payBill();
        });
    }

    const doneBtn = document.querySelector('#bill-payment-success .btn-secondary');
    if (doneBtn) {
        doneBtn.addEventListener('click', function() {
            document.getElementById('bill-payment-form').style.display = 'block';
            document.getElementById('bill-payment-form').reset();
            document.getElementById('bill-payment-success').classList.add('hidden');
            loadBills();
        });
    }
}

function loadBills() {
    const token = getToken();
    fetch('/api/bills', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            userBills = data.bills;
            updateBillsList();
            setTimeout(() => {
                updateBillsSelector();
            }, 100);
        }
    })
    .catch(err => {});
}

function updateBillsList() {
    const container = document.getElementById('bills-list');
    if (userBills.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No bills to pay</p>';
        return;
    }

    container.innerHTML = userBills.map(bill => `
        <div class="bill-row ${bill.status === 'paid' ? 'paid' : ''}">
            <div class="bill-row-header">
                <span class="bill-row-name">${bill.biller_name}</span>
                <span class="bill-row-amount">৳${bill.amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            <div class="bill-row-due">Due: ${new Date(bill.due_date).toLocaleDateString()} • ${bill.category}</div>
        </div>
    `).join('');
}

function updateBillsSelector() {
    const selector = document.getElementById('bill-selector');
    const accountSelector = document.getElementById('payment-account');
    
    if (selector) {
        selector.innerHTML = '<option>Choose a bill...</option>' + 
            userBills.filter(b => b.status !== 'paid').map(bill => 
                `<option value="${bill.id}">${bill.biller_name} - ৳${(bill.amount || 0).toFixed(2)}</option>`
            ).join('');
    }

    if (accountSelector) {
        accountSelector.innerHTML = '<option>Choose account...</option>' +
            userAccounts.map(acc => 
                `<option value="${acc.id}">${acc.name} - ৳${(acc.balance || 0).toFixed(2)}</option>`
            ).join('');
    }
}

function payBill() {
    if (!selectedBill) {
        alert('Please select a bill');
        return;
    }

    const accountId = document.getElementById('payment-account').value;
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const token = getToken();

    fetch('/api/pay-bill', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            bill_id: selectedBill.id,
            account_id: accountId,
            amount: amount
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            const successMessage = document.getElementById('bill-payment-success');
            const successDetails = document.getElementById('payment-success-details');
            
            successDetails.innerHTML = `<strong>৳${amount.toFixed(2)}</strong> paid to <strong>${selectedBill.biller_name}</strong>`;
            
            document.getElementById('bill-payment-form').style.display = 'none';
            successMessage.classList.remove('hidden');
            
            loadBills();
            loadAccountsAndCards();
        } else {
            alert('Payment failed: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
    }
}

function getToken() {
    return localStorage.getItem('token');
}

function loadUserData() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
        document.getElementById('user-name').textContent = user.name;
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('greet-name').textContent = user.name.split(' ')[0];
    }
}

function loadAccountsAndCards() {
    const token = getToken();
    
    Promise.all([
        fetch('/api/accounts', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()),
        fetch('/api/cards', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json())
    ]).then(([accountsData, cardsData]) => {
        if (accountsData.success) {
            userAccounts = accountsData.accounts;
            updateDashboardBalances();
            updateAccountsPage();
            updateTransferForm();
        }
        if (cardsData.success) {
            userCards = cardsData.cards;
            updateCardsPage();
        }
    }).catch(err => {});
}

function updateDashboardBalances() {
    if (userAccounts.length === 0) return;
    
    const totalBalance = userAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const savingsAccount = userAccounts.find(a => a.type === 'savings');
    const checkingAccount = userAccounts.find(a => a.type === 'checking');
    
    const balanceCard = document.querySelector('.balance-card .amount');
    if (balanceCard) balanceCard.textContent = `৳${totalBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    if (savingsAccount) {
        const savingsCard = document.querySelector('.savings-card .amount');
        if (savingsCard) savingsCard.textContent = `৳${(savingsAccount.balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        const savingsSubtitle = document.querySelector('.savings-card .subtitle');
        if (savingsSubtitle) savingsSubtitle.textContent = `Interest: ${savingsAccount.apy}% APY`;
    }
    
    if (checkingAccount) {
        const checkingCard = document.querySelector('.checking-card .amount');
        if (checkingCard) checkingCard.textContent = `৳${(checkingAccount.balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
}

function updateAccountsPage() {
    const container = document.querySelector('.accounts-container');
    if (!container) return;
    
    container.innerHTML = userAccounts.map(account => `
        <div class="account-card">
            <div class="account-header">
                <h4>${account.name}</h4>
                <span class="account-type">${account.type === 'checking' ? 'Primary' : 'Secondary'}</span>
            </div>
            <div class="account-number">${account.cardNumber}</div>
            <div class="account-balance">
                <p class="label">Available Balance</p>
                <p class="amount">৳${(account.balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
            </div>
            <div class="account-actions">
                <button class="action-btn" onclick="showAccountDetails('${account.id}')">Details</button>
                <button class="action-btn" onclick="toggleFreezeAccount('${account.id}', '${account.status}')">${account.status === 'frozen' ? 'Unfreeze' : 'Freeze'}</button>
                <button class="action-btn" onclick="showAccountSettings('${account.id}')">Settings</button>
            </div>
        </div>
    `).join('');
}

function updateCardsPage() {
    const container = document.querySelector('.cards-container');
    if (!container) return;
    
    container.innerHTML = userCards.map(card => {
        const isCredit = card.type === 'credit';
        const cardClass = isCredit ? 'credit-card' : 'debit-card';
        
        return `
            <div class="${cardClass}">
                <div class="card-top">
                    <div class="card-chip">💳</div>
                    <p class="card-label">${isCredit ? 'CREDIT' : 'DEBIT'} CARD</p>
                </div>
                <p class="card-number">${card.number}</p>
                <div class="card-footer">
                    <div>
                        <p class="card-holder-label">Card Holder</p>
                        <p class="card-holder">${card.holder}</p>
                    </div>
                    <div>
                        <p class="card-expiry-label">Expires</p>
                        <p class="card-expiry">${card.expiry}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateTransferForm() {
    const fromAccountSelect = document.getElementById('from-account');
    if (fromAccountSelect) {
        fromAccountSelect.innerHTML = userAccounts.map(acc =>
            `<option value="${acc.name} (৳${acc.balance.toFixed(2)})">${acc.name} - ৳${acc.balance.toFixed(2)}</option>`
        ).join('');
    }
}

function loadTransactions() {
    const token = getToken();
    fetch('/api/transactions', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            userTransactions = data.transactions;
            updateRecentTransactions();
            updateTransactionsPage();
        }
    })
    .catch(err => {});
}

function updateRecentTransactions() {
    const container = document.getElementById('recent-transactions');
    if (!container) return;
    
    if (userTransactions.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center;">No transactions yet</p>';
        return;
    }
    
    const recent = userTransactions.slice(0, 3);
    container.innerHTML = recent.map(tx => {
        const date = new Date(tx.created_at);
        const isNegative = tx.amount < 0;
        const icon = isNegative ? '📤' : '📥';
        
        return `
            <div class="transaction-item">
                <div class="transaction-left">
                    <span class="transaction-icon">${icon}</span>
                    <div class="transaction-details">
                        <p class="transaction-name">${tx.description || 'Transfer'}</p>
                        <p class="transaction-date">${date.toLocaleDateString()}</p>
                    </div>
                </div>
                <p class="transaction-amount ${isNegative ? 'negative' : 'positive'}">
                    ${isNegative ? '-' : '+'}৳${Math.abs(tx.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </p>
            </div>
        `;
    }).join('');
}

function updateTransactionsPage() {
    const container = document.getElementById('transactions-full');
    if (!container) return;
    
    if (userTransactions.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No transactions yet</p>';
        return;
    }
    
    container.innerHTML = userTransactions.map(tx => {
        const date = new Date(tx.created_at);
        const isNegative = tx.amount < 0;
        const icon = isNegative ? '📤' : '📥';
        
        return `
            <div class="transaction-row">
                <div class="transaction-info">
                    <span class="icon">${icon}</span>
                    <div>
                        <p class="name">${tx.description || 'Transfer'}</p>
                        <p class="date">${date.toLocaleString()}</p>
                    </div>
                </div>
                <p class="amount ${isNegative ? 'negative' : 'positive'}">
                    ${isNegative ? '-' : '+'}৳${Math.abs(tx.amount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </p>
            </div>
        `;
    }).join('');
}

function showAccountDetails(accountId) {
    const account = userAccounts.find(a => a.id === accountId);
    if (!account) return;
    
    document.getElementById('detailName').textContent = account.name || '-';
    document.getElementById('detailType').textContent = account.type ? account.type.charAt(0).toUpperCase() + account.type.slice(1) : '-';
    document.getElementById('detailCard').textContent = account.cardNumber || '-';
    document.getElementById('detailBalance').textContent = `৳${(account.balance || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('detailAPY').textContent = (account.apy || 0) + '%';
    
    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = account.status ? account.status.charAt(0).toUpperCase() + account.status.slice(1) : 'Active';
    statusBadge.className = `status-badge ${account.status || 'active'}`;
    
    openModal('detailsModal');
}

function showAccountSettings(accountId) {
    const account = userAccounts.find(a => a.id === accountId);
    if (!account) return;
    
    selectedAccount = account;
    document.getElementById('settingName').value = account.name || '';
    openModal('settingsModal');
}

function saveAccountSettings() {
    if (!selectedAccount) return;
    
    const newName = document.getElementById('settingName').value.trim();
    if (!newName) {
        alert('Please enter account name');
        return;
    }
    
    const token = getToken();
    fetch('/api/accounts/update', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            id: selectedAccount.id,
            name: newName
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Account updated successfully');
            closeModal('settingsModal');
            loadAccountsAndCards();
        } else {
            alert('Failed to update account: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function toggleFreezeAccount(accountId, currentStatus) {
    const newStatus = currentStatus === 'frozen' ? 'active' : 'frozen';
    const token = getToken();
    
    fetch('/api/account/freeze', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            id: accountId,
            status: newStatus
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert(`Account ${newStatus === 'frozen' ? 'frozen' : 'unfrozen'} successfully`);
            loadAccountsAndCards();
            setTimeout(() => updateAccountsPage(), 500);
        } else {
            alert('Failed to update account status: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function loadProfileSettings() {
    const token = getToken();
    fetch('/api/user', {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            document.getElementById('setting-name').value = data.user.name;
            document.getElementById('setting-email').value = data.user.email;
            document.getElementById('setting-phone').value = data.user.phone || '';
        }
    })
    .catch(err => {});
    
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleProfileUpdate();
        });
    }
    
    const passwordForm = document.getElementById('password-form');
    if (passwordForm) {
        passwordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handlePasswordChange();
        });
    }
}

function handleProfileUpdate() {
    const name = document.getElementById('setting-name').value.trim();
    const phone = document.getElementById('setting-phone').value.trim();
    const token = getToken();
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    fetch('/api/profile/update', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            phone: phone
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Profile updated successfully');
            loadUserData();
        } else {
            alert('Failed to update profile: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function handlePasswordChange() {
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const token = getToken();
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill in all password fields');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    fetch('/api/profile/change-password', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('Password changed successfully');
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
        } else {
            alert('Failed to change password: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

function showComingSoon(featureName) {
    document.getElementById('comingSoonMessage').textContent = `${featureName} will be available soon!`;
    openModal('comingSoonModal');
}

function showContactSupport(featureName) {
    alert(`To ${featureName}, please contact our support team.`);
}

function resetTransferForm() {
    const transferForm = document.getElementById('transfer-form');
    const successMessage = document.getElementById('transfer-success');
    
    transferForm.reset();
    transferForm.style.display = 'block';
    successMessage.classList.add('hidden');
}

function initCharts() {
    const spendingCtx = document.getElementById('spendingChart');
    const categoryCtx = document.getElementById('categoryChart');
    
    if (spendingCtx.dataset.initialized) return;
    
    new Chart(spendingCtx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Weekly Spending',
                data: [1200, 1900, 800, 1500],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                fill: true,
                pointBackgroundColor: '#667eea',
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#666' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { color: '#666' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#666' }
                }
            }
        }
    });

    new Chart(categoryCtx, {
        type: 'doughnut',
        data: {
            labels: ['Shopping', 'Dining', 'Transportation', 'Entertainment', 'Other'],
            datasets: [{
                data: [456.78, 263.45, 338.92, 185.30, 102.55],
                backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#f5576c',
                    '#4facfe'
                ],
                borderColor: '#fff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#666', padding: 20 }
                }
            }
        }
    });

    spendingCtx.dataset.initialized = true;
}

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

// Close menu when clicking nav buttons
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', closeMobileMenu);
});


// Mobile bottom nav functions
function switchSection(btn) {
    const section = btn.dataset.section;
    if (section) {
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(section).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('[data-section="' + section + '"]').forEach(b => b.classList.add('active'));
        document.getElementById('page-title').textContent = section.charAt(0).toUpperCase() + section.slice(1);
        closeMobileMenu();
        closeMoreMenu();
    }
}

function showMoreMenu() {
    const menu = document.getElementById('more-menu');
    if (menu) menu.classList.toggle('active');
}

function closeMoreMenu() {
    const menu = document.getElementById('more-menu');
    if (menu) menu.classList.remove('active');
}

// Close more menu when clicking outside
document.addEventListener('click', function(e) {
    const moreMenu = document.getElementById('more-menu');
    const moreBtn = document.getElementById('more-btn');
    if (moreMenu && moreBtn && !moreMenu.contains(e.target) && !moreBtn.contains(e.target)) {
        closeMoreMenu();
    }
});

// Deposit Modal Functions
function openDepositModal() {
    openModal('depositModal');
}

function submitDeposit() {
    const token = localStorage.getItem('token');
    const accountId = document.getElementById('deposit-account').value;
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    
    if (!accountId || !amount || amount <= 0) {
        alert('Please select an account and enter a valid amount');
        return;
    }
    
    fetch('/api/deposit', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            account_id: accountId,
            amount: amount
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert(`Deposit successful! ৳${amount.toFixed(2)} added to your account.`);
            loadAccountsAndCards();
            loadUserData();
            closeModal('depositModal');
            document.getElementById('deposit-amount').value = '';
        } else {
            alert('Deposit failed: ' + data.message);
        }
    })
    .catch(err => alert('Error: ' + err.message));
}


function goToSection(sectionName) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionName).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('[data-section="' + sectionName + '"]').forEach(b => b.classList.add('active'));
    document.getElementById('page-title').textContent = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}

