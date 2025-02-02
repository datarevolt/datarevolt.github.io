// 数据库初始化
let db;
const DB_NAME = 'FinanceDB';
const DB_VERSION = 1;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // 创建订单表
            if (!db.objectStoreNames.contains('orders')) {
                const orderStore = db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
                orderStore.createIndex('userId', 'userId', { unique: false });
                orderStore.createIndex('submitTime', 'submitTime', { unique: false });
                orderStore.createIndex('orderDate', 'orderDate', { unique: false });
            }
            
            // 创建用户表
            if (!db.objectStoreNames.contains('users')) {
                const userStore = db.createObjectStore('users', { keyPath: 'userId' });
                userStore.createIndex('registerTime', 'registerTime', { unique: false });
            }
        };
    });
};

// 获取美东时间
const getESTTime = (date = new Date()) => {
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
};

// 格式化日期
const formatDate = (date) => {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
};

// 添加订单
const addOrder = async (data) => {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['orders', 'users'], 'readwrite');
            const orderStore = transaction.objectStore('orders');
            const userStore = transaction.objectStore('users');

            const orderData = {
                ...data,
                submitTime: new Date().toISOString(),
                orderDate: new Date(data.orderDate).toISOString(),
                amount: parseFloat(data.amount)
            };

            // 先检查用户是否存在
            const getUserRequest = userStore.get(data.userId);
            
            getUserRequest.onsuccess = () => {
                let user = getUserRequest.result || {
                    userId: data.userId,
                    registerTime: new Date().toISOString(),
                    totalDeposit: 0,
                    totalWithdrawal: 0,
                    note: ''
                };

                // 更新用户统计
                if (data.type === 'deposit') {
                    user.totalDeposit = (parseFloat(user.totalDeposit) || 0) + orderData.amount;
                } else {
                    user.totalWithdrawal = (parseFloat(user.totalWithdrawal) || 0) + orderData.amount;
                }

                // 保存用户数据
                userStore.put(user);
                
                // 保存订单数据
                orderStore.add(orderData);
            };

            transaction.oncomplete = () => {
                console.log('Transaction completed: database modification finished.');
                resolve();
            };
            
            transaction.onerror = () => {
                console.error('Transaction error:', transaction.error);
                reject(transaction.error);
            };
        } catch (error) {
            console.error('Error in addOrder:', error);
            reject(error);
        }
    });
};

// 删除订单
const deleteOrder = async (orderId) => {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['orders', 'users'], 'readwrite');
            const orderStore = transaction.objectStore('orders');
            const userStore = transaction.objectStore('users');

            const getOrderRequest = orderStore.get(orderId);
            
            getOrderRequest.onsuccess = () => {
                const order = getOrderRequest.result;
                if (!order) {
                    reject(new Error('订单不存在'));
                    return;
                }

                const getUserRequest = userStore.get(order.userId);
                getUserRequest.onsuccess = () => {
                    const user = getUserRequest.result;
                    if (user) {
                        if (order.type === 'deposit') {
                            user.totalDeposit = Math.max(0, user.totalDeposit - order.amount);
                        } else {
                            user.totalWithdrawal = Math.max(0, user.totalWithdrawal - order.amount);
                        }
                        userStore.put(user);
                    }
                    orderStore.delete(orderId);
                };
            };

            transaction.oncomplete = () => {
                console.log('Delete transaction completed');
                resolve();
            };
            
            transaction.onerror = () => {
                console.error('Delete transaction error:', transaction.error);
                reject(transaction.error);
            };
        } catch (error) {
            console.error('Error in deleteOrder:', error);
            reject(error);
        }
    });
};

// 删除用户
const deleteUser = async (userId) => {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['orders', 'users'], 'readwrite');
            const orderStore = transaction.objectStore('orders');
            const userStore = transaction.objectStore('users');

            // 删除用户的所有订单
            const index = orderStore.index('userId');
            const getOrdersRequest = index.getAll(userId);
            
            getOrdersRequest.onsuccess = () => {
                const orders = getOrdersRequest.result;
                orders.forEach(order => {
                    orderStore.delete(order.id);
                });
                userStore.delete(userId);
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        } catch (error) {
            reject(error);
        }
    });
};

// 获取月度数据
const getMonthlyData = async (date) => {
    return new Promise((resolve, reject) => {
        try {
            const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
            const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            
            const transaction = db.transaction(['orders'], 'readonly');
            const orderStore = transaction.objectStore('orders');
            const index = orderStore.index('orderDate');
            
            const request = index.getAll(IDBKeyRange.bound(
                startDate.toISOString(),
                endDate.toISOString()
            ));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (error) {
            reject(error);
        }
    });
};

// 获取所有用户
const getAllUsers = async () => {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['users'], 'readonly');
            const userStore = transaction.objectStore('users');
            const request = userStore.getAll();

            request.onsuccess = () => {
                console.log('Retrieved users:', request.result);
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        } catch (error) {
            console.error('Error in getAllUsers:', error);
            reject(error);
        }
    });
};

// 获取所有订单
const getAllOrders = async () => {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['orders'], 'readonly');
            const orderStore = transaction.objectStore('orders');
            const request = orderStore.getAll();

            request.onsuccess = () => {
                console.log('Retrieved orders:', request.result);
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        } catch (error) {
            console.error('Error in getAllOrders:', error);
            reject(error);
        }
    });
};

// 更新用户备注
const updateUserNote = async (userId, note) => {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(['users'], 'readwrite');
            const userStore = transaction.objectStore('users');

            const getUserRequest = userStore.get(userId);
            getUserRequest.onsuccess = () => {
                const user = getUserRequest.result;
                if (user) {
                    user.note = note;
                    userStore.put(user);
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        } catch (error) {
            reject(error);
        }
    });
};