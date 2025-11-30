#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import uuid
import random
import sqlite3
from urllib.parse import urlparse, parse_qs
import re
from datetime import datetime, timedelta

os.chdir(os.path.dirname(os.path.abspath(__file__)))

DB_FILE = 'banking.db'
sessions = {}

def init_database():
    conn = sqlite3.connect(DB_FILE, timeout=10.0)
    conn.execute('PRAGMA journal_mode=WAL')
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        password TEXT,
        phone TEXT,
        created_at TEXT
    )''')
    
    # Add phone column if it doesn't exist
    try:
        c.execute('ALTER TABLE users ADD COLUMN phone TEXT')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    c.execute('''CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT,
        type TEXT,
        balance REAL,
        card_number TEXT,
        apy REAL,
        fees REAL,
        status TEXT,
        created_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        account_id TEXT,
        type TEXT,
        number TEXT,
        holder TEXT,
        expiry TEXT,
        status TEXT,
        card_limit REAL,
        created_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(account_id) REFERENCES accounts(id)
    )''')
    
    try:
        c.execute('ALTER TABLE cards ADD COLUMN account_id TEXT')
    except sqlite3.OperationalError:
        pass
    
    c.execute('''CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        from_account_id TEXT,
        to_account_id TEXT,
        amount REAL,
        description TEXT,
        status TEXT,
        created_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(from_account_id) REFERENCES accounts(id),
        FOREIGN KEY(to_account_id) REFERENCES accounts(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        biller_name TEXT,
        amount REAL,
        due_date TEXT,
        category TEXT,
        status TEXT,
        created_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        loan_type TEXT,
        principal_amount REAL,
        remaining_amount REAL,
        interest_rate REAL,
        monthly_payment REAL,
        start_date TEXT,
        end_date TEXT,
        status TEXT,
        created_at TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    
    conn.commit()
    conn.close()

def get_user_by_email(email):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE email = ?', (email.lower(),))
    user = c.fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_id(user_id):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = c.fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_accounts(user_id):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at', (user_id,))
    accounts = [dict(row) for row in c.fetchall()]
    conn.close()
    return accounts

def get_user_cards(user_id):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM cards WHERE user_id = ? ORDER BY created_at', (user_id,))
    cards = [dict(row) for row in c.fetchall()]
    conn.close()
    return cards

def update_account_balance(account_id, new_balance):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('UPDATE accounts SET balance = ? WHERE id = ?', (new_balance, account_id))
    conn.commit()
    conn.close()

def get_account_by_id(account_id):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT * FROM accounts WHERE id = ?', (account_id,))
    account = c.fetchone()
    conn.close()
    return dict(account) if account else None

def update_account_status(account_id, status):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('UPDATE accounts SET status = ? WHERE id = ?', (status, account_id))
    conn.commit()
    conn.close()

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def get_token(self):
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            return auth[7:]
        return None

    def get_user_email_from_token(self):
        token = self.get_token()
        if token and token in sessions:
            return sessions[token]['email']
        return None

    def do_GET(self):
        if self.path == '/':
            self.path = '/login.html'
        elif self.path == '/api/accounts':
            self.handle_get_accounts()
            return
        elif self.path == '/api/cards':
            self.handle_get_cards()
            return
        elif self.path == '/api/user':
            self.handle_get_user()
            return
        elif self.path == '/api/transactions':
            self.handle_get_transactions()
            return
        elif self.path == '/api/bills':
            self.handle_get_bills()
            return
        elif self.path == '/api/loans':
            self.handle_get_loans()
            return
        elif self.path.startswith('/api/account/'):
            account_id = self.path.split('/')[-1]
            self.handle_get_account(account_id)
            return
        
        return super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode()
        
        if self.path == '/api/login':
            self.handle_login(body)
        elif self.path == '/api/register':
            self.handle_register(body)
        elif self.path == '/api/accounts/update':
            self.handle_update_account(body)
        elif self.path == '/api/cards/update':
            self.handle_update_card(body)
        elif self.path == '/api/transfer':
            self.handle_transfer(body)
        elif self.path == '/api/pay-bill':
            self.handle_pay_bill(body)
        elif self.path == '/api/apply-loan':
            self.handle_apply_loan(body)
        elif self.path == '/api/account/freeze':
            self.handle_freeze_account(body)
        elif self.path == '/api/account/settings':
            self.handle_account_settings(body)
        elif self.path == '/api/profile/update':
            self.handle_update_profile(body)
        elif self.path == '/api/profile/change-password':
            self.handle_change_password(body)
        elif self.path == '/api/deposit':
            self.handle_deposit(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def handle_update_profile(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            name = data.get('name', '').strip()
            phone = data.get('phone', '').strip()
            
            if not name:
                self.send_json({'success': False, 'message': 'Name is required'})
                return
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute('UPDATE users SET name = ?, phone = ? WHERE email = ?', (name, phone, email))
            conn.commit()
            conn.close()
            
            sessions_to_update = [token for token, sess in sessions.items() if sess.get('email') == email]
            for token in sessions_to_update:
                sessions[token]['name'] = name
            
            self.send_json({'success': True, 'message': 'Profile updated successfully'})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)
    
    def handle_change_password(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            old_password = data.get('old_password', '')
            new_password = data.get('new_password', '')
            confirm_password = data.get('confirm_password', '')
            
            if len(new_password) < 6:
                self.send_json({'success': False, 'message': 'New password must be at least 6 characters'})
                return
            
            if new_password != confirm_password:
                self.send_json({'success': False, 'message': 'Passwords do not match'})
                return
            
            user = get_user_by_email(email)
            if not user or user['password'] != old_password:
                self.send_json({'success': False, 'message': 'Current password is incorrect'})
                return
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute('UPDATE users SET password = ? WHERE email = ?', (new_password, email))
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Password changed successfully'})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)
    
    def handle_get_account(self, account_id):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        account = get_account_by_id(account_id)
        if not account:
            self.send_json({'success': False, 'message': 'Account not found'}, 404)
            return
        
        formatted = {
            'id': account['id'],
            'name': account['name'],
            'type': account['type'],
            'balance': account['balance'],
            'cardNumber': account['card_number'],
            'apy': account['apy'],
            'fees': account['fees'],
            'status': account['status']
        }
        
        self.send_json({'success': True, 'account': formatted})

    def handle_freeze_account(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            account_id = data.get('id')
            action = data.get('action')
            
            account = get_account_by_id(account_id)
            if not account:
                self.send_json({'success': False, 'message': 'Account not found'}, 404)
                return
            
            new_status = 'frozen' if action == 'freeze' else 'active'
            update_account_status(account_id, new_status)
            
            self.send_json({
                'success': True,
                'message': f"Account {action}d successfully",
                'status': new_status
            })
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_account_settings(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            account_id = data.get('id')
            account_name = data.get('name')
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute('UPDATE accounts SET name = ? WHERE id = ?', (account_name, account_id))
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Settings updated'})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_get_transactions(self):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        user = get_user_by_email(email)
        if not user:
            self.send_json({'success': False, 'message': 'User not found'}, 404)
            return
        
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', (user['id'],))
        transactions = [dict(row) for row in c.fetchall()]
        conn.close()
        
        self.send_json({'success': True, 'transactions': transactions})
    
    def handle_get_user(self):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        user = get_user_by_email(email)
        if not user:
            self.send_json({'success': False, 'message': 'User not found'}, 404)
            return
        
        self.send_json({
            'success': True,
            'user': {
                'name': user['name'],
                'email': user['email'],
                'phone': user.get('phone', '')
            }
        })

    def handle_get_accounts(self):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        user = get_user_by_email(email)
        if not user:
            self.send_json({'success': False, 'message': 'User not found'}, 404)
            return
        
        accounts = get_user_accounts(user['id'])
        formatted_accounts = [{
            'id': acc['id'],
            'name': acc['name'],
            'type': acc['type'],
            'balance': acc['balance'],
            'cardNumber': acc['card_number'],
            'apy': acc['apy'],
            'fees': acc['fees'],
            'status': acc['status']
        } for acc in accounts]
        
        self.send_json({'success': True, 'accounts': formatted_accounts})

    def handle_get_cards(self):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        user = get_user_by_email(email)
        if not user:
            self.send_json({'success': False, 'message': 'User not found'}, 404)
            return
        
        cards = get_user_cards(user['id'])
        formatted_cards = [{
            'id': card['id'],
            'type': card['type'],
            'number': card['number'],
            'holder': card['holder'],
            'expiry': card['expiry'],
            'status': card['status'],
            'limit': card['card_limit']
        } for card in cards]
        
        self.send_json({'success': True, 'cards': formatted_cards})

    def handle_update_account(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            account_id = data.get('id')
            name = data.get('name')
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            # Only update name if provided
            if name:
                c.execute('UPDATE accounts SET name = ? WHERE id = ?', (name, account_id))
            
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Account updated'})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_update_card(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            card_id = data.get('id')
            status = data.get('status')
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute('UPDATE cards SET status = ? WHERE id = ?', (status, card_id))
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Card updated'})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_get_bills(self):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        user = get_user_by_email(email)
        if not user:
            self.send_json({'success': False, 'message': 'User not found'}, 404)
            return
        
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        c.execute('SELECT COUNT(*) FROM bills WHERE user_id = ?', (user['id'],))
        bill_count = c.fetchone()[0]
        
        if bill_count == 0:
            from datetime import timedelta
            bills_data = [
                ('Electric Bill', 14500.00, 'utilities', 'pending'),
                ('Internet Bill', 9999.00, 'utilities', 'pending'),
                ('Phone Bill', 7500.00, 'utilities', 'pending'),
                ('Insurance', 24000.00, 'insurance', 'pending'),
                ('Rent/Mortgage', 140000.00, 'housing', 'pending')
            ]
            
            for biller, amount, category, status in bills_data:
                bill_id = str(uuid.uuid4())
                due_date = (datetime.now() + timedelta(days=random.randint(5, 25))).isoformat()
                c.execute('''INSERT INTO bills (id, user_id, biller_name, amount, due_date, category, status, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                          (bill_id, user['id'], biller, amount, due_date, category, status, datetime.now().isoformat()))
            conn.commit()
        
        c.execute('SELECT * FROM bills WHERE user_id = ? ORDER BY due_date', (user['id'],))
        bills = [dict(row) for row in c.fetchall()]
        conn.close()
        
        formatted_bills = [{
            'id': bill['id'],
            'biller_name': bill['biller_name'],
            'amount': bill['amount'],
            'due_date': bill['due_date'],
            'category': bill['category'],
            'status': bill['status']
        } for bill in bills]
        
        self.send_json({'success': True, 'bills': formatted_bills})
    
    def handle_pay_bill(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            bill_id = data.get('bill_id')
            account_id = data.get('account_id')
            amount = float(data.get('amount', 0))
            
            if amount <= 0:
                self.send_json({'success': False, 'message': 'Invalid amount'})
                return
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            c.execute('SELECT balance FROM accounts WHERE id = ?', (account_id,))
            result = c.fetchone()
            
            if not result or result[0] < amount:
                conn.close()
                self.send_json({'success': False, 'message': 'Insufficient balance'})
                return
            
            new_balance = result[0] - amount
            c.execute('UPDATE accounts SET balance = ? WHERE id = ?', (new_balance, account_id))
            
            c.execute('UPDATE bills SET status = ? WHERE id = ?', ('paid', bill_id))
            
            user = get_user_by_email(email)
            if user:
                transaction_id = str(uuid.uuid4())
                c.execute('''INSERT INTO transactions (id, user_id, from_account_id, amount, description, status, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?)''',
                          (transaction_id, user['id'], account_id, -amount, f'Bill payment', 'completed', datetime.now().isoformat()))
            
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Bill paid successfully', 'balance': new_balance})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_transfer(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            from_account_id = data.get('from_account_id')
            amount = float(data.get('amount', 0))
            description = data.get('description', '')
            
            if amount <= 0:
                self.send_json({'success': False, 'message': 'Invalid amount'})
                return
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            c.execute('SELECT balance FROM accounts WHERE id = ?', (from_account_id,))
            result = c.fetchone()
            
            if not result or result[0] < amount:
                conn.close()
                self.send_json({'success': False, 'message': 'Insufficient balance'})
                return
            
            new_balance = result[0] - amount
            c.execute('UPDATE accounts SET balance = ? WHERE id = ?', (new_balance, from_account_id))
            
            transaction_id = str(uuid.uuid4())
            user = get_user_by_email(email)
            if user:
                c.execute('''INSERT INTO transactions (id, user_id, from_account_id, amount, description, status, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?)''',
                          (transaction_id, user['id'], from_account_id, -amount, description, 'completed', datetime.now().isoformat()))
            
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Transfer successful', 'balance': new_balance})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_login(self, body):
        try:
            data = json.loads(body)
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            
            user = get_user_by_email(email)
            
            if user and user['password'] == password:
                token = str(uuid.uuid4())
                user_info = {
                    'name': user['name'],
                    'email': user['email'],
                    'phone': user.get('phone', '')
                }
                sessions[token] = {'email': email, 'name': user['name'], 'user_id': user['id']}
                
                self.send_json({
                    'success': True,
                    'token': token,
                    'user': user_info
                })
            else:
                self.send_json({
                    'success': False,
                    'message': 'Invalid email or password'
                })
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_register(self, body):
        try:
            data = json.loads(body)
            name = data.get('name', '').strip()
            email = data.get('email', '').strip().lower()
            password = data.get('password', '')
            
            if not name or not email or len(password) < 6:
                self.send_json({
                    'success': False,
                    'message': 'Invalid input. Name, email, and password (min 6 chars) required.'
                })
                return
            
            if not re.match(r'^[^@]+@[^@]+\.[^@]+$', email):
                self.send_json({
                    'success': False,
                    'message': 'Invalid email format'
                })
                return
            
            if get_user_by_email(email):
                self.send_json({
                    'success': False,
                    'message': 'Email already registered'
                })
                return
            
            user_id = str(uuid.uuid4())
            checking_balance = 0.00
            savings_balance = 0.00
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            
            c.execute('''INSERT INTO users (id, email, name, password, created_at)
                         VALUES (?, ?, ?, ?, ?)''',
                      (user_id, email, name, password, datetime.now().isoformat()))
            
            checking_acc_id = str(uuid.uuid4())
            savings_acc_id = str(uuid.uuid4())
            
            checking_account_number = f"4829{random.randint(10000000, 99999999)}{random.randint(1000, 9999)}"
            savings_account_number = f"5012{random.randint(10000000, 99999999)}{random.randint(1000, 9999)}"
            
            debit_card_last4 = random.randint(1000, 9999)
            credit_card_last4 = random.randint(1000, 9999)
            
            c.execute('''INSERT INTO accounts (id, user_id, name, type, balance, card_number, apy, fees, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (checking_acc_id, user_id, 'Checking Account', 'checking', checking_balance,
                       checking_account_number, 0.0, 0.0, 'active', datetime.now().isoformat()))
            
            c.execute('''INSERT INTO accounts (id, user_id, name, type, balance, card_number, apy, fees, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (savings_acc_id, user_id, 'Savings Account', 'savings', savings_balance,
                       savings_account_number, 2.5, 0.0, 'active', datetime.now().isoformat()))
            
            debit_card_id = str(uuid.uuid4())
            credit_card_id = str(uuid.uuid4())
            
            c.execute('''INSERT INTO cards (id, user_id, account_id, type, number, holder, expiry, status, card_limit, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (debit_card_id, user_id, checking_acc_id, 'debit', f"6789 •••• •••• {debit_card_last4}",
                       name.upper(), '12/26', 'active', 5000, datetime.now().isoformat()))
            
            c.execute('''INSERT INTO cards (id, user_id, account_id, type, number, holder, expiry, status, card_limit, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (credit_card_id, user_id, savings_acc_id, 'credit', f"8765 •••• •••• {credit_card_last4}",
                       name.upper(), '03/27', 'active', 10000, datetime.now().isoformat()))
            
            bills_data = [
                ('Electric Bill', 14500.00, 'utilities', 'pending'),
                ('Internet Bill', 9999.00, 'utilities', 'pending'),
                ('Phone Bill', 7500.00, 'utilities', 'pending'),
                ('Insurance', 24000.00, 'insurance', 'pending'),
                ('Rent/Mortgage', 140000.00, 'housing', 'pending')
            ]
            
            from datetime import timedelta
            for biller, amount, category, status in bills_data:
                bill_id = str(uuid.uuid4())
                due_date = (datetime.now() + timedelta(days=random.randint(5, 25))).isoformat()
                c.execute('''INSERT INTO bills (id, user_id, biller_name, amount, due_date, category, status, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                          (bill_id, user_id, biller, amount, due_date, category, status, datetime.now().isoformat()))
            
            conn.commit()
            conn.close()
            
            token = str(uuid.uuid4())
            user_info = {'name': name, 'email': email, 'phone': ''}
            sessions[token] = {'email': email, 'name': name, 'user_id': user_id}
            
            self.send_json({
                'success': True,
                'token': token,
                'user': user_info
            })
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_get_loans(self):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        user = get_user_by_email(email)
        if not user:
            self.send_json({'success': False, 'message': 'User not found'}, 404)
            return
        
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM loans WHERE user_id = ? ORDER BY created_at DESC', (user['id'],))
        loans = [dict(row) for row in c.fetchall()]
        conn.close()
        
        formatted_loans = [{
            'id': loan['id'],
            'loan_type': loan['loan_type'],
            'principal_amount': loan['principal_amount'],
            'remaining_amount': loan['remaining_amount'],
            'interest_rate': loan['interest_rate'],
            'monthly_payment': loan['monthly_payment'],
            'start_date': loan['start_date'],
            'end_date': loan['end_date'],
            'status': loan['status']
        } for loan in loans]
        
        self.send_json({'success': True, 'loans': formatted_loans})

    def handle_apply_loan(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            loan_type = data.get('loan_type')
            principal_amount = float(data.get('principal_amount', 0))
            tenure_months = int(data.get('tenure_months', 60))
            
            if principal_amount <= 0:
                self.send_json({'success': False, 'message': 'Invalid loan amount'})
                return
            
            interest_rates = {'home': 8.5, 'personal': 12.0, 'auto': 7.5, 'education': 6.5}
            interest_rate = interest_rates.get(loan_type, 10.0)
            
            monthly_rate = interest_rate / 100 / 12
            if monthly_rate > 0:
                monthly_payment = (principal_amount * monthly_rate * ((1 + monthly_rate)**tenure_months)) / (((1 + monthly_rate)**tenure_months) - 1)
            else:
                monthly_payment = principal_amount / tenure_months
            
            user = get_user_by_email(email)
            if not user:
                self.send_json({'success': False, 'message': 'User not found'}, 404)
                return
            
            loan_id = str(uuid.uuid4())
            end_date = (datetime.now() + timedelta(days=tenure_months*30)).isoformat()
            
            conn = sqlite3.connect(DB_FILE)
            c = conn.cursor()
            c.execute('''INSERT INTO loans (id, user_id, loan_type, principal_amount, remaining_amount, interest_rate, monthly_payment, start_date, end_date, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                      (loan_id, user['id'], loan_type, principal_amount, principal_amount * 0.8, interest_rate, monthly_payment, datetime.now().isoformat(), end_date, 'active', datetime.now().isoformat()))
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Loan application approved', 'loan_id': loan_id})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

    def handle_deposit(self, body):
        email = self.get_user_email_from_token()
        if not email:
            self.send_json({'success': False, 'message': 'Unauthorized'}, 401)
            return
        
        try:
            data = json.loads(body)
            account_type = data.get('account_id')
            amount = float(data.get('amount', 0))
            
            if amount <= 0:
                self.send_json({'success': False, 'message': 'Invalid deposit amount'})
                return
            
            user = get_user_by_email(email)
            if not user:
                self.send_json({'success': False, 'message': 'User not found'}, 404)
                return
            
            conn = sqlite3.connect(DB_FILE, timeout=10.0)
            c = conn.cursor()
            
            # Map account_type to account type in database
            account_type_map = {'checking': 'checking', 'savings': 'savings'}
            db_account_type = account_type_map.get(account_type, 'checking')
            
            # Get the account
            c.execute('SELECT * FROM accounts WHERE user_id = ? AND type = ?', (user['id'], db_account_type))
            account = c.fetchone()
            
            if not account:
                conn.close()
                self.send_json({'success': False, 'message': 'Account not found'})
                return
            
            # Update account balance - handle None values
            current_balance = account[4] if account[4] is not None else 0.0
            new_balance = current_balance + amount
            c.execute('UPDATE accounts SET balance = ? WHERE id = ?', (new_balance, account[0]))
            
            # Record transaction with correct columns
            transaction_id = str(uuid.uuid4())
            c.execute('''INSERT INTO transactions (id, user_id, from_account_id, to_account_id, amount, description, status, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                      (transaction_id, user['id'], account[0], account[0], amount, f'Deposit ৳{amount}', 'completed', datetime.now().isoformat()))
            
            conn.commit()
            conn.close()
            
            self.send_json({'success': True, 'message': 'Deposit successful', 'new_balance': new_balance})
        except Exception as e:
            self.send_json({'success': False, 'message': str(e)}, 500)

PORT = 5000
Handler = MyHTTPRequestHandler

init_database()
print(f"🚀 Banking System running at http://0.0.0.0:{PORT}")
print(f"📊 Database: {DB_FILE}")
print("Press Ctrl+C to stop")

with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    httpd.serve_forever()
