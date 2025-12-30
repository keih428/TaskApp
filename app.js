// タスク管理アプリケーション
class TaskApp {
    constructor() {
        this.tasks = [];
        this.editingTaskId = null;
        this.sortMode = 'deadline-asc';
        this.deleteTimers = new Map();
        this.googleSheetsConfig = {
            webAppUrl: ''
        };
        this.isLoading = false;
        
        this.init();
    }
    
    async init() {
        this.loadConfigFromLocalStorage();
        this.setupEventListeners();
        this.setTodayAsRegistrationDate();
        
        // Google Sheetsからデータを読み込む
        await this.loadFromGoogleSheets();
    }
    
    loadConfigFromLocalStorage() {
        // Google Sheets設定の読み込み
        const savedConfig = localStorage.getItem('googleSheetsConfig');
        if (savedConfig) {
            this.googleSheetsConfig = JSON.parse(savedConfig);
            document.getElementById('web-app-url').value = this.googleSheetsConfig.webAppUrl || '';
        }
        
        // ソート設定の読み込み
        const savedSort = localStorage.getItem('sortMode');
        if (savedSort) {
            this.sortMode = savedSort;
            document.getElementById('sort-select').value = savedSort;
        }
    }
    
    saveConfigToLocalStorage() {
        localStorage.setItem('googleSheetsConfig', JSON.stringify(this.googleSheetsConfig));
    }
    
    setupEventListeners() {
        // フォーム送信
        document.getElementById('task-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTask();
        });
        
        // クリアボタン
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearForm();
        });
        
        // キャンセルボタン
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.cancelEdit();
        });
        
        // ソート変更
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.sortMode = e.target.value;
            localStorage.setItem('sortMode', this.sortMode);
            this.renderAllTasks();
        });
        
        // Google Sheets設定保存
        document.getElementById('save-config-btn').addEventListener('click', () => {
            this.saveGoogleSheetsConfig();
        });
        
        // 同期ボタン
        document.getElementById('sync-btn').addEventListener('click', () => {
            this.syncWithGoogleSheets();
        });
    }
    
    setTodayAsRegistrationDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('task-registration').value = today;
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
    
    async saveTask() {
        const name = document.getElementById('task-name').value.trim();
        const deadline = document.getElementById('task-deadline').value;
        const registration = document.getElementById('task-registration').value;
        const important = document.getElementById('task-important').checked;
        const urgent = document.getElementById('task-urgent').checked;
        const details = document.getElementById('task-details').value.trim();
        
        if (!name || !deadline) {
            alert('タスク名と期限は必須です。');
            return;
        }
        
        const task = {
            id: this.editingTaskId || this.generateId(),
            name,
            deadline,
            registration: registration || new Date().toISOString().split('T')[0],
            important,
            urgent,
            details
        };
        
        // Google Sheetsに保存
        const success = await this.saveTaskToGoogleSheets(task);
        
        if (success) {
            if (this.editingTaskId) {
                // 編集
                const index = this.tasks.findIndex(t => t.id === this.editingTaskId);
                if (index !== -1) {
                    this.tasks[index] = task;
                }
            } else {
                // 新規追加
                this.tasks.push(task);
            }
            
            this.renderAllTasks();
            this.clearForm();
        }
    }
    
    clearForm() {
        document.getElementById('task-form').reset();
        this.setTodayAsRegistrationDate();
        this.editingTaskId = null;
        document.getElementById('task-id').value = '';
        document.getElementById('cancel-btn').style.display = 'none';
        document.getElementById('save-btn').textContent = '保存';
    }
    
    cancelEdit() {
        this.clearForm();
    }
    
    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        document.getElementById('task-name').value = task.name;
        document.getElementById('task-deadline').value = task.deadline;
        document.getElementById('task-registration').value = task.registration;
        document.getElementById('task-important').checked = task.important;
        document.getElementById('task-urgent').checked = task.urgent;
        document.getElementById('task-details').value = task.details || '';
        document.getElementById('task-id').value = task.id;
        
        this.editingTaskId = taskId;
        document.getElementById('cancel-btn').style.display = 'inline-block';
        document.getElementById('save-btn').textContent = '更新';
        
        // フォームまでスクロール
        document.querySelector('.left-panel').scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    async deleteTask(taskId) {
        // Google Sheetsから削除
        const success = await this.deleteTaskFromGoogleSheets(taskId);
        
        if (success) {
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.renderAllTasks();
            
            // 編集中のタスクが削除された場合
            if (this.editingTaskId === taskId) {
                this.clearForm();
            }
        }
    }
    
    handleCheckboxChange(taskId, checked) {
        if (checked) {
            // チェックされた - 3秒後に削除
            const timer = setTimeout(() => {
                this.deleteTask(taskId);
                this.deleteTimers.delete(taskId);
            }, 3000);
            
            this.deleteTimers.set(taskId, timer);
            
            // カードに削除中クラスを追加
            const card = document.querySelector(`[data-task-id="${taskId}"]`);
            if (card) {
                card.classList.add('deleting');
            }
        } else {
            // チェックが外された - タイマーをキャンセル
            if (this.deleteTimers.has(taskId)) {
                clearTimeout(this.deleteTimers.get(taskId));
                this.deleteTimers.delete(taskId);
            }
            
            // 削除中クラスを削除
            const card = document.querySelector(`[data-task-id="${taskId}"]`);
            if (card) {
                card.classList.remove('deleting');
            }
        }
    }
    
    getDaysUntilDeadline(deadline) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadlineDate = new Date(deadline);
        deadlineDate.setHours(0, 0, 0, 0);
        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }
    
    getDeadlineClass(deadline) {
        const days = this.getDaysUntilDeadline(deadline);
        
        if (days < 0) return 'deadline-overdue';
        if (days === 0) return 'deadline-today';
        if (days <= 3) return 'deadline-1-3';
        if (days <= 7) return 'deadline-4-7';
        return 'deadline-far';
    }
    
    getDeadlineText(deadline) {
        const days = this.getDaysUntilDeadline(deadline);
        
        if (days < 0) return `期限切れ (${Math.abs(days)}日前)`;
        if (days === 0) return '今日が期限';
        if (days === 1) return '明日が期限';
        return `あと${days}日`;
    }
    
    sortTasks(tasks) {
        const sorted = [...tasks];
        
        switch (this.sortMode) {
            case 'deadline-asc':
                sorted.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
                break;
            case 'registration-asc':
                sorted.sort((a, b) => new Date(a.registration) - new Date(b.registration));
                break;
            case 'registration-desc':
                sorted.sort((a, b) => new Date(b.registration) - new Date(a.registration));
                break;
        }
        
        return sorted;
    }
    
    createTaskCard(task) {
        const card = document.createElement('div');
        card.className = `task-card ${this.getDeadlineClass(task.deadline)}`;
        card.setAttribute('data-task-id', task.id);
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.handleCheckboxChange(task.id, e.target.checked);
        });
        
        const content = document.createElement('div');
        content.className = 'task-content';
        
        const name = document.createElement('div');
        name.className = 'task-name';
        name.textContent = task.name;
        
        const deadline = document.createElement('div');
        deadline.className = 'task-deadline';
        deadline.textContent = `${task.deadline} (${this.getDeadlineText(task.deadline)})`;
        
        content.appendChild(name);
        content.appendChild(deadline);
        
        card.appendChild(checkbox);
        card.appendChild(content);
        
        // カードクリックで編集
        card.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                this.editTask(task.id);
            }
        });
        
        return card;
    }
    
    renderAllTasks() {
        // 各象限をクリア
        const quadrants = [
            'urgent-important',
            'urgent-not-important',
            'not-urgent-important',
            'not-urgent-not-important'
        ];
        
        quadrants.forEach(id => {
            document.getElementById(id).innerHTML = '';
        });
        
        // タスクを分類してレンダリング
        this.tasks.forEach(task => {
            let quadrantId;
            
            if (task.urgent && task.important) {
                quadrantId = 'urgent-important';
            } else if (task.urgent && !task.important) {
                quadrantId = 'urgent-not-important';
            } else if (!task.urgent && task.important) {
                quadrantId = 'not-urgent-important';
            } else {
                quadrantId = 'not-urgent-not-important';
            }
            
            const quadrant = document.getElementById(quadrantId);
            const card = this.createTaskCard(task);
            quadrant.appendChild(card);
        });
        
        // 各象限内でソート
        quadrants.forEach(id => {
            const quadrant = document.getElementById(id);
            const cards = Array.from(quadrant.children);
            const sortedCards = this.sortTaskCards(cards);
            quadrant.innerHTML = '';
            sortedCards.forEach(card => quadrant.appendChild(card));
        });
    }
    
    sortTaskCards(cards) {
        return cards.sort((a, b) => {
            const taskIdA = a.getAttribute('data-task-id');
            const taskIdB = b.getAttribute('data-task-id');
            const taskA = this.tasks.find(t => t.id === taskIdA);
            const taskB = this.tasks.find(t => t.id === taskIdB);
            
            if (!taskA || !taskB) return 0;
            
            switch (this.sortMode) {
                case 'deadline-asc':
                    return new Date(taskA.deadline) - new Date(taskB.deadline);
                case 'registration-asc':
                    return new Date(taskA.registration) - new Date(taskB.registration);
                case 'registration-desc':
                    return new Date(taskB.registration) - new Date(taskA.registration);
                default:
                    return 0;
            }
        });
    }
    
    saveGoogleSheetsConfig() {
        this.googleSheetsConfig.webAppUrl = document.getElementById('web-app-url').value.trim();
        
        this.saveConfigToLocalStorage();
        alert('Google Sheets設定を保存しました。ページを再読み込みしてデータを取得します。');
        
        // 設定保存後にデータを読み込む
        setTimeout(() => {
            location.reload();
        }, 1000);
    }
    
    async loadFromGoogleSheets() {
        if (!this.googleSheetsConfig.webAppUrl) {
            console.log('Google Apps Script Web App URLが設定されていません。');
            return;
        }
        
        if (this.isLoading) return;
        this.isLoading = true;
        
        try {
            const response = await fetch(this.googleSheetsConfig.webAppUrl);
            
            if (!response.ok) {
                throw new Error('データの取得に失敗しました。');
            }
            
            const data = await response.json();
            
            if (data.tasks) {
                this.tasks = data.tasks;
                this.renderAllTasks();
            }
        } catch (error) {
            console.error('読み込みエラー:', error);
            alert('Google Sheetsからのデータ読み込みに失敗しました。Web App URLを確認してください。');
        } finally {
            this.isLoading = false;
        }
    }
    
    async saveTaskToGoogleSheets(task) {
        if (!this.googleSheetsConfig.webAppUrl) {
            alert('Google Apps Script Web App URLを設定してください。');
            return false;
        }
        
        try {
            const response = await fetch(this.googleSheetsConfig.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'save',
                    task: task
                })
            });
            
            if (!response.ok) {
                throw new Error('タスクの保存に失敗しました。');
            }
            
            const result = await response.json();
            
            if (result.success) {
                return true;
            } else {
                throw new Error(result.error || '保存に失敗しました。');
            }
        } catch (error) {
            console.error('保存エラー:', error);
            alert('タスクの保存に失敗しました: ' + error.message);
            return false;
        }
    }
    
    async deleteTaskFromGoogleSheets(taskId) {
        if (!this.googleSheetsConfig.webAppUrl) {
            alert('Google Apps Script Web App URLを設定してください。');
            return false;
        }
        
        try {
            const response = await fetch(this.googleSheetsConfig.webAppUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'delete',
                    taskId: taskId
                })
            });
            
            if (!response.ok) {
                throw new Error('タスクの削除に失敗しました。');
            }
            
            const result = await response.json();
            
            if (result.success) {
                return true;
            } else {
                throw new Error(result.error || '削除に失敗しました。');
            }
        } catch (error) {
            console.error('削除エラー:', error);
            alert('タスクの削除に失敗しました: ' + error.message);
            return false;
        }
    }
    
    async syncWithGoogleSheets() {
        await this.loadFromGoogleSheets();
        if (this.tasks.length > 0) {
            alert('同期が完了しました。');
        }
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new TaskApp();
});
