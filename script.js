document.addEventListener('DOMContentLoaded', function() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section');
    const pageTitle = document.getElementById('page-title');
    const transferForm = document.getElementById('transfer-form');
    const logoutBtn = document.querySelector('.logout-btn');

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
        });
    });

    function updatePageTitle(sectionId) {
        const titles = {
            dashboard: 'Dashboard',
            accounts: 'Your Accounts',
            cards: 'Your Cards',
            transfer: 'Send Money',
            transactions: 'Transaction History',
            analytics: 'Financial Analytics',
            settings: 'Settings'
        };
        pageTitle.textContent = titles[sectionId] || 'Dashboard';
    }

    transferForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const fromAccount = document.getElementById('from-account').value;
        const recipientName = document.getElementById('recipient-name').value;
        const amount = document.getElementById('amount').value;
        
        const successMessage = document.getElementById('transfer-success');
        const successDetails = document.getElementById('success-details');
        
        successDetails.innerHTML = `<p><strong>$${parseFloat(amount).toFixed(2)}</strong> transferred to <strong>${recipientName}</strong> from <strong>${fromAccount}</strong></p>`;
        
        transferForm.style.display = 'none';
        successMessage.classList.remove('hidden');
    });

    const doneBtn = document.querySelector('#transfer-success .btn-secondary');
    if (doneBtn) {
        doneBtn.addEventListener('click', function() {
            document.getElementById('transfer-form').style.display = 'block';
            document.getElementById('transfer-form').reset();
            document.getElementById('transfer-success').classList.add('hidden');
        });
    }

    logoutBtn.addEventListener('click', function() {
        alert('Logged out successfully!');
    });

    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            this.classList.toggle('enabled');
            this.textContent = this.classList.contains('enabled') ? 'Enabled' : 'Disabled';
        });
    });

    const saveSettingsBtn = document.querySelector('.settings-container .btn-primary');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', function() {
            alert('Settings saved successfully!');
        });
    }

    const notificationBtn = document.querySelector('.notification-btn');
    notificationBtn.addEventListener('click', function() {
        alert('You have 3 new notifications');
    });

    document.getElementById('send-money-btn').addEventListener('click', function() {
        document.querySelector('[data-section="transfer"]').click();
    });

    document.getElementById('pay-bills-btn').addEventListener('click', function() {
        alert('Pay Bills feature coming soon!');
    });

    document.getElementById('request-money-btn').addEventListener('click', function() {
        alert('Request Money feature coming soon!');
    });

    const addAccountBtn = document.querySelector('#accounts .btn-primary');
    if (addAccountBtn) {
        addAccountBtn.addEventListener('click', function() {
            alert('Add Account feature coming soon!');
        });
    }

    const orderCardBtn = document.querySelector('#cards .btn-primary');
    if (orderCardBtn) {
        orderCardBtn.addEventListener('click', function() {
            alert('Order Card feature coming soon!');
        });
    }

    const managementBtns = document.querySelectorAll('.management-item .btn-secondary');
    managementBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            alert(this.textContent + ' feature coming soon!');
        });
    });
});

function initCharts() {
    const spendingCtx = document.getElementById('spendingChart');
    const categoryCtx = document.getElementById('categoryChart');

    if (!spendingCtx || spendingCtx.dataset.initialized) return;

    new Chart(spendingCtx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
            datasets: [{
                label: 'Spending',
                data: [450, 380, 520, 410],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                tension: 0.4,
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
