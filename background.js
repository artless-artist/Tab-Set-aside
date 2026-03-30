let storedTabs = [];
let workspaces = [];

const DEFAULT_SETTINGS = {
    closeAfterStash: false,
    newTabAfterStash: true,
    removeAfterOpen: true,
    theme: 'dark',
    sortOrder: 'desc'
};

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 地址栏按钮：暂存当前标签页
browser.pageAction.onClicked.addListener(async (tab) => {
    await stashTab(tab);
});

// 控制地址栏按钮的显示/隐藏
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:') && !tab.url.startsWith('moz-extension:')) {
        browser.pageAction.show(tabId);
    }
});

browser.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await browser.tabs.get(activeInfo.tabId);
        if (tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:') && !tab.url.startsWith('moz-extension:')) {
            browser.pageAction.show(activeInfo.tabId);
        } else {
            browser.pageAction.hide(activeInfo.tabId);
        }
    } catch (e) {}
});

async function getSettings() {
    const result = await browser.storage.local.get(['settings']);
    return result.settings || DEFAULT_SETTINGS;
}

async function getContainerInfo(cookieStoreId) {
    if (!cookieStoreId || cookieStoreId === 'default') {
        return null;
    }
    try {
        if (!browser.contextualIdentities) {
            return null;
        }
        const context = await browser.contextualIdentities.get(cookieStoreId);
        return {
            cookieStoreId: context.cookieStoreId,
            name: context.name,
            color: context.color,
            icon: context.icon
        };
    } catch (e) {
        return null;
    }
}

async function stashTab(tab) {
    if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('chrome:') || tab.url.startsWith('moz-extension:')) {
        return null;
    }

    const settings = await getSettings();
    const containerInfo = await getContainerInfo(tab.cookieStoreId);
    
    // 构建新标签页数据用于比较
    const newTabData = {
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        container: containerInfo
    };
    
    // 查找是否存在相同的标签页
    const existingIndex = storedTabs.findIndex(existingTab => 
        existingTab.url === newTabData.url && 
        existingTab.container?.cookieStoreId === newTabData.container?.cookieStoreId
    );
    
    let tabData;
    
    if (existingIndex !== -1) {
        // 存在相同的标签页，移动到最下方（更新时间和标题）
        tabData = storedTabs[existingIndex];
        // 更新标题和图标（可能已改变）
        tabData.title = tab.title;
        tabData.favIconUrl = tab.favIconUrl;
        tabData.timestamp = Date.now();
        
        // 从原位置移除
        storedTabs.splice(existingIndex, 1);
        // 添加到末尾
        storedTabs.push(tabData);
        
        try {
            await browser.storage.local.set({ storedTabs });
        } catch (e) {
            console.error("更新标签页位置失败:", e);
            return null;
        }
    } else {
        // 不存在，创建新条目
        tabData = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            container: containerInfo,
            timestamp: Date.now()
        };
        
        storedTabs.push(tabData);
        
        try {
            await browser.storage.local.set({ storedTabs });
        } catch (e) {
            console.error("保存标签页失败:", e);
            storedTabs.pop();
            return null;
        }
    }

    if (settings.closeAfterStash) {
        // 检查关闭此标签页后窗口是否还有标签页
        const tabsInWindow = await browser.tabs.query({ windowId: tab.windowId });
        const isLastTab = tabsInWindow.length === 1;
        
        // 如果窗口只剩这一个标签页，且用户开启了新标签页选项，需要在关闭前先创建新标签页
        if (settings.newTabAfterStash && isLastTab) {
            const allWindows = await browser.windows.getAll();
            // 确保关闭后不会导致浏览器无窗口
            if (allWindows.length === 1) {
                // 先创建新标签页，再关闭原标签页
                await browser.tabs.create({ active: true });
            }
        }
        
        // 关闭原标签页
        await browser.tabs.remove(tab.id);
    }
    return tabData;
}

async function stashCurrentTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) {
        return await stashTab(tab);
    }
    return null;
}

async function stashWorkspace() {
    const currentWindow = await browser.windows.getCurrent();
    const tabs = await browser.tabs.query({ windowId: currentWindow.id });
    const settings = await getSettings();

    if (tabs.length === 0) return null;

    const workspaceId = 'workspace-' + Date.now();
    const workspaceTabs = [];

    for (const tab of tabs) {
        if (!tab.url || tab.url.startsWith('about:') || tab.url.startsWith('chrome:') || tab.url.startsWith('moz-extension:')) {
            continue;
        }
        const containerInfo = await getContainerInfo(tab.cookieStoreId);
        
        // 检查工作区中是否已有相同标签页（去重）
        const existingIndex = workspaceTabs.findIndex(existingTab => 
            existingTab.url === tab.url && 
            existingTab.container?.cookieStoreId === containerInfo?.cookieStoreId
        );
        
        if (existingIndex !== -1) {
            // 如果已存在，更新标题和图标
            workspaceTabs[existingIndex].title = tab.title;
            workspaceTabs[existingIndex].favIconUrl = tab.favIconUrl;
            workspaceTabs[existingIndex].timestamp = Date.now();
        } else {
            const tabData = {
                id: Date.now() + Math.random().toString(36).substr(2, 9),
                title: tab.title,
                url: tab.url,
                favIconUrl: tab.favIconUrl,
                container: containerInfo,
                timestamp: Date.now(),
                workspaceId: workspaceId
            };
            workspaceTabs.push(tabData);
        }
    }

    const workspace = {
        id: workspaceId,
        name: `工作区 ${new Date().toLocaleTimeString()}`,
        tabs: workspaceTabs,
        timestamp: Date.now()
    };

    workspaces.push(workspace);

    try {
        await browser.storage.local.set({ workspaces });
    } catch (e) {
        console.error("保存工作区失败:", e);
        workspaces.pop();
        return null;
    }

    if (settings.closeAfterStash) {
        // 搁置整个窗口：如果启用了新标签页选项，在关闭所有标签页前先创建新标签页
        if (settings.newTabAfterStash) {
            const allWindows = await browser.windows.getAll();
            const isLastWindow = allWindows.length === 1;
            if (isLastWindow) {
                await browser.tabs.create({ active: true });
            }
        }
        const tabIds = tabs.map(t => t.id).filter(id => id);
        if (tabIds.length > 0) await browser.tabs.remove(tabIds);
    }
    return workspace;
}

async function openTab(tabData, removeFromList = false) {
    if (!tabData.url || tabData.url.startsWith('about:')) return;
    const createOptions = { url: tabData.url, active: false };
    if (tabData.container && tabData.container.cookieStoreId) {
        createOptions.cookieStoreId = tabData.container.cookieStoreId;
    }
    await browser.tabs.create(createOptions);

    if (removeFromList) {
        storedTabs = storedTabs.filter(t => t.id !== tabData.id);
        try {
            await browser.storage.local.set({ storedTabs });
        } catch (e) {
            console.error("更新列表失败:", e);
        }
    }
}

async function openWorkspace(workspaceId, removeFromList = false) {
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) return;
    const settings = await getSettings();

    for (const tabData of workspace.tabs) {
        await openTab(tabData, false);
    }

    if (removeFromList || settings.removeAfterOpen) {
        workspaces = workspaces.filter(w => w.id !== workspaceId);
        try {
            await browser.storage.local.set({ workspaces });
        } catch (e) {
            console.error("更新工作区列表失败:", e);
        }
    }
}

async function removeTab(tabId) {
    storedTabs = storedTabs.filter(t => t.id !== tabId);
    try {
        await browser.storage.local.set({ storedTabs });
    } catch (e) {
        console.error(e);
    }
}

async function removeWorkspace(workspaceId) {
    workspaces = workspaces.filter(w => w.id !== workspaceId);
    try {
        await browser.storage.local.set({ workspaces });
    } catch (e) {
        console.error(e);
    }
}

async function clearAll() {
    storedTabs = [];
    workspaces = [];
    try {
        await browser.storage.local.set({ storedTabs, workspaces });
    } catch (e) {
        console.error("清空所有数据失败:", e);
    }
}

async function getStoredData() {
    const result = await browser.storage.local.get(['storedTabs', 'workspaces']);
    storedTabs = result.storedTabs || [];
    workspaces = result.workspaces || [];

    const groupedWorkspaces = workspaces.map(w => ({
        ...w,
        tabs: w.tabs || []
    }));
    return { tabs: storedTabs, workspaces: groupedWorkspaces };
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'stashCurrentTab':
            stashCurrentTab().then(tab => sendResponse({ success: true, tab }));
            return true;
        case 'stashWorkspace':
            stashWorkspace().then(workspace => sendResponse({ success: true, workspace })).catch(e => sendResponse({ success: false, error: e.message }));
            return true;
        case 'openTab':
            openTab(message.tabData, message.removeFromList).then(() => sendResponse({ success: true }));
            return true;
        case 'openWorkspace':
            openWorkspace(message.workspaceId, message.removeFromList).then(() => sendResponse({ success: true }));
            return true;
        case 'removeTab':
            removeTab(message.tabId).then(() => sendResponse({ success: true }));
            return true;
        case 'removeWorkspace':
            removeWorkspace(message.workspaceId).then(() => sendResponse({ success: true }));
            return true;
        case 'clearAll':
            clearAll().then(() => sendResponse({ success: true }));
            return true;
        case 'getStoredData':
            getStoredData().then(data => sendResponse(data));
            return true;
        case 'getSettings':
            getSettings().then(settings => sendResponse(settings));
            return true;
        case 'saveSettings':
            browser.storage.local.set({ settings: message.settings }).then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
            return true;
        case 'updateWorkspaceName':
            const workspace = workspaces.find(w => w.id === message.workspaceId);
            if (workspace) {
                workspace.name = message.name;
                browser.storage.local.set({ workspaces }).then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
            } else {
                sendResponse({ success: false });
            }
            return true;
    }
});

async function init() {
    const result = await browser.storage.local.get(['storedTabs', 'workspaces', 'settings']);
    if (result.storedTabs) storedTabs = result.storedTabs;
    if (result.workspaces) workspaces = result.workspaces;
    if (!result.settings) {
        await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    
    // 初始化时检查当前标签页并显示地址栏按钮
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:') && !tab.url.startsWith('moz-extension:')) {
        browser.pageAction.show(tab.id);
    }
}

browser.runtime.onInstalled.addListener(async () => {
    await init();
});

init();