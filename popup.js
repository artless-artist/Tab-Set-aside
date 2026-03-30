const containerColors = { 'blue': '#0090ff', 'turquoise': '#00c8d4', 'green': '#2eb317', 'yellow': '#efc100', 'orange': '#ff9500', 'red': '#ff3b30', 'pink': '#ff2d55', 'purple': '#af52de', 'toolbar': '#808080' };
const containerIcons = { 'briefcase': '💼', 'person': '👤', 'cart': '🛒', 'circle': '⭕', 'dollar': '💵', 'fence': '🚧', 'tree': '🌲', 'pet': '🐾', 'fruit': '🍎', 'food': '🍔', 'vacation': '🏖️', 'gift': '🎁', 'chill': '😎' };
const workspaceColors = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ac8e68'];

let settings = { closeAfterStash: false, newTabAfterStash: true, removeAfterOpen: true, theme: 'dark', sortOrder: 'desc' };
let storedData = { tabs: [], workspaces: [] };
let isDataLoaded = false;
let isSettingsVisible = false;

// 核心防御：增加超时保护，防止后台未响应时popup卡死产生1像素幽灵窗口
async function safeSendMessage(message, timeout = 2000) {
  return Promise.race([
    browser.runtime.sendMessage(message),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
  ]);
}

async function loadSettings() {
  try {
    settings = await safeSendMessage({ action: 'getSettings' });
    if (settings && settings.theme) {
      applyTheme(settings.theme);
    }
    if (!settings.sortOrder) {
      settings.sortOrder = 'desc';
    }
  } catch (e) {
    console.error('loadSettings error:', e);
    applyTheme('dark');
  }
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.setAttribute('data-theme', 'light');
  } else {
    document.body.removeAttribute('data-theme');
  }
}

async function loadData() {
  try {
    storedData = await safeSendMessage({ action: 'getStoredData' });
    renderAll();
  } catch (e) {
    console.error('loadData error:', e);
    storedData = { tabs: [], workspaces: [] };
    renderAll();
  } finally {
    isDataLoaded = true;
  }
}

function getWorkspaceColor(index) {
  return workspaceColors[index % workspaceColors.length];
}

// 根据排序方式获取排序后的项目列表
function getSortedItems() {
  const allItems = [];
  storedData.tabs.forEach(tab => allItems.push({ type: 'tab', data: tab, timestamp: tab.timestamp }));
  storedData.workspaces.forEach((workspace, index) => allItems.push({ type: 'workspace', data: workspace, color: getWorkspaceColor(index), timestamp: workspace.timestamp }));
  
  // 根据排序方式排序
  if (settings.sortOrder === 'asc') {
    // 正序：最早添加的在最上方，最新添加的在最下方
    return allItems.sort((a, b) => a.timestamp - b.timestamp);
  } else {
    // 倒序：最新添加的在最上方，最早添加的在最下方
    return allItems.sort((a, b) => b.timestamp - a.timestamp);
  }
}

// 创建标签页元素（安全DOM方法）
function createTabElement(tab, index) {
  const item = document.createElement('div');
  item.className = 'item';
  item.dataset.type = 'tab';
  item.dataset.id = tab.id;
  item.dataset.index = String(index);
  
  const main = document.createElement('div');
  main.className = 'item-main';
  
  // Favicon
  const faviconDiv = document.createElement('div');
  faviconDiv.className = 'item-favicon';
  if (tab.favIconUrl) {
    const img = document.createElement('img');
    img.src = tab.favIconUrl;
    img.alt = '';
    faviconDiv.appendChild(img);
  } else {
    faviconDiv.textContent = '🌐';
  }
  
  // Info container
  const info = document.createElement('div');
  info.className = 'item-info';
  
  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = tab.title || '';
  info.appendChild(title);
  
  if (tab.container) {
    const containerDiv = document.createElement('div');
    containerDiv.className = 'item-container';
    containerDiv.style.color = containerColors[tab.container.color] || '#808080';
    containerDiv.textContent = containerIcons[tab.container.icon] || '👤';
    info.appendChild(containerDiv);
  }
  
  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'item-close';
  closeBtn.dataset.id = tab.id;
  closeBtn.title = '删除';
  
  main.appendChild(faviconDiv);
  main.appendChild(info);
  main.appendChild(closeBtn);
  item.appendChild(main);
  
  return item;
}

// 创建工作区元素（安全DOM方法）
function createWorkspaceElement(workspace, color, index) {
  const item = document.createElement('div');
  item.className = 'item';
  item.dataset.type = 'workspace';
  item.dataset.id = workspace.id;
  item.dataset.index = String(index);
  
  // Header
  const header = document.createElement('div');
  header.className = 'item-main workspace-header';
  
  const expandBtn = document.createElement('span');
  expandBtn.className = 'workspace-expand';
  expandBtn.dataset.id = workspace.id;
  
  const badge = document.createElement('span');
  badge.className = 'workspace-badge';
  badge.style.background = color;
  badge.textContent = '工作区';
  
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'workspace-name-input';
  nameInput.value = workspace.name || '';
  nameInput.dataset.id = workspace.id;
  nameInput.placeholder = '输入工作区名称';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'item-close';
  closeBtn.dataset.id = workspace.id;
  closeBtn.title = '删除';
  
  header.appendChild(expandBtn);
  header.appendChild(badge);
  header.appendChild(nameInput);
  header.appendChild(closeBtn);
  item.appendChild(header);
  
  // Favicons
  const faviconsDiv = document.createElement('div');
  faviconsDiv.className = 'workspace-favicons';
  faviconsDiv.dataset.id = workspace.id;
  
  if (workspace.tabs && workspace.tabs.length > 0) {
    workspace.tabs.slice(0, 8).forEach(tab => {
      const span = document.createElement('span');
      span.className = 'workspace-favicon';
      if (tab.favIconUrl) {
        const img = document.createElement('img');
        img.src = tab.favIconUrl;
        img.alt = '';
        span.appendChild(img);
      } else {
        span.textContent = '🌐';
      }
      faviconsDiv.appendChild(span);
    });
  }
  item.appendChild(faviconsDiv);
  
  // Tabs container
  const tabsDiv = document.createElement('div');
  tabsDiv.className = 'workspace-tabs';
  tabsDiv.dataset.id = workspace.id;
  
  if (workspace.tabs && workspace.tabs.length > 0) {
    workspace.tabs.forEach(tab => {
      const tabEl = document.createElement('div');
      tabEl.className = 'workspace-tab';
      tabEl.dataset.workspaceId = workspace.id;
      tabEl.dataset.tabId = tab.id;
      
      const tabFavicon = document.createElement('span');
      tabFavicon.className = 'tab-favicon-small';
      if (tab.favIconUrl) {
        const img = document.createElement('img');
        img.src = tab.favIconUrl;
        img.alt = '';
        tabFavicon.appendChild(img);
      } else {
        tabFavicon.textContent = '🌐';
      }
      
      const tabTitle = document.createElement('span');
      tabTitle.className = 'tab-title-small';
      tabTitle.textContent = tab.title || '';
      
      tabEl.appendChild(tabFavicon);
      tabEl.appendChild(tabTitle);
      
      if (tab.container) {
        const containerSpan = document.createElement('span');
        containerSpan.className = 'item-container';
        containerSpan.style.color = containerColors[tab.container.color] || '#808080';
        containerSpan.textContent = containerIcons[tab.container.icon] || '👤';
        tabEl.appendChild(containerSpan);
      }
      
      tabsDiv.appendChild(tabEl);
    });
    
    if (workspace.tabs.length > 5) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'more-tabs';
      moreDiv.textContent = `...还有 ${workspace.tabs.length - 5} 个标签页`;
      tabsDiv.appendChild(moreDiv);
    }
  }
  item.appendChild(tabsDiv);
  
  return item;
}

// 清空元素的所有子节点
function clearElement(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function renderAll() {
  const itemsList = document.getElementById('items-list');
  const emptyState = document.getElementById('empty-state');
  
  // 只在非设置页面时更新空状态显示
  if (!isSettingsVisible) {
    const allItems = getSortedItems();
    if (allItems.length === 0) {
      clearElement(itemsList);
      emptyState.style.display = 'block';
      itemsList.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      itemsList.style.display = 'flex';
      clearElement(itemsList);
      
      allItems.forEach((item, index) => {
        const element = item.type === 'tab' 
          ? createTabElement(item.data, index) 
          : createWorkspaceElement(item.data, item.color, index);
        itemsList.appendChild(element);
      });
      
      attachEventListeners(allItems);
    }
  }
}

function attachEventListeners(allItems) {
  const itemsList = document.getElementById('items-list');
  
  itemsList.querySelectorAll('.item-main').forEach(main => {
    const item = main.closest('.item');
    const type = item.dataset.type;
    const id = item.dataset.id;
    
    main.addEventListener('click', async (e) => {
      if (e.target.classList.contains('item-close') || 
          e.target.classList.contains('workspace-name-input') || 
          e.target.classList.contains('workspace-expand')) return;
      
      try {
        if (type === 'tab') {
          const tab = storedData.tabs.find(t => t.id === id);
          if (tab) await safeSendMessage({ action: 'openTab', tabData: tab, removeFromList: settings.removeAfterOpen });
        } else {
          await safeSendMessage({ action: 'openWorkspace', workspaceId: id, removeFromList: settings.removeAfterOpen });
        }
        await loadData();
      } catch (e) { 
        console.error('open error:', e); 
      }
    });
  });

  itemsList.querySelectorAll('.workspace-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.classList.toggle('expanded');
      const tabsEl = document.querySelector(`.workspace-tabs[data-id="${btn.dataset.id}"]`);
      const faviconsEl = document.querySelector(`.workspace-favicons[data-id="${btn.dataset.id}"]`);
      if (tabsEl) tabsEl.classList.toggle('expanded');
      if (faviconsEl) faviconsEl.classList.toggle('expanded');
    });
  });

  itemsList.querySelectorAll('.workspace-favicons').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await safeSendMessage({ action: 'openWorkspace', workspaceId: el.dataset.id, removeFromList: settings.removeAfterOpen });
        await loadData();
      } catch (e) { 
        console.error('openWorkspace error:', e); 
      }
    });
  });

  itemsList.querySelectorAll('.workspace-name-input').forEach(input => {
    input.addEventListener('click', e => e.stopPropagation());
    input.addEventListener('change', async (e) => {
      try {
        await safeSendMessage({ action: 'updateWorkspaceName', workspaceId: e.target.dataset.id, name: e.target.value });
      } catch (e) { 
        console.error('updateWorkspaceName error:', e); 
      }
    });
  });

  itemsList.querySelectorAll('.workspace-tab').forEach(tabEl => {
    tabEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const workspace = storedData.workspaces.find(w => w.id === tabEl.dataset.workspaceId);
      if (workspace && workspace.tabs) {
        const tab = workspace.tabs.find(t => t.id === tabEl.dataset.tabId);
        if (tab) await safeSendMessage({ action: 'openTab', tabData: tab, removeFromList: false });
      }
    });
  });

  itemsList.querySelectorAll('.item-close').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const item = btn.closest('.item');
      const type = item.dataset.type;
      try {
        if (type === 'tab') {
          await safeSendMessage({ action: 'removeTab', tabId: btn.dataset.id });
        } else {
          await safeSendMessage({ action: 'removeWorkspace', workspaceId: btn.dataset.id });
        }
      } catch (e) { 
        console.error('remove error:', e); 
      }
      await loadData();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleSettings() {
  if (!isDataLoaded) return;
  isSettingsVisible = !isSettingsVisible;
  
  const stashBtn = document.getElementById('stashWorkspaceBtn');
  const clearBtn = document.getElementById('clearAllBtn');
  const spacer = document.querySelector('.header-spacer');
  const itemsList = document.getElementById('items-list');
  const emptyState = document.getElementById('empty-state');
  const settingsContent = document.getElementById('settings-content');

  if (isSettingsVisible) {
    // 隐藏列表和空状态
    stashBtn.style.visibility = 'hidden';
    clearBtn.style.visibility = 'hidden';
    spacer.style.visibility = 'hidden';
    itemsList.style.display = 'none';
    emptyState.style.display = 'none';
    settingsContent.style.display = 'block';
    
    // 更新所有开关状态
    document.getElementById('themeToggle').classList.toggle('active', settings.theme === 'dark');
    document.getElementById('closeAfterStashToggle').classList.toggle('active', settings.closeAfterStash);
    document.getElementById('newTabAfterStashToggle').classList.toggle('active', settings.newTabAfterStash);
    document.getElementById('removeAfterOpenToggle').classList.toggle('active', settings.removeAfterOpen);
    document.getElementById('sortOrderToggle').classList.toggle('active', settings.sortOrder === 'asc');
    document.getElementById('newTabAfterStashItem').style.display = settings.closeAfterStash ? 'flex' : 'none';
  } else {
    // 显示列表和空状态
    stashBtn.style.visibility = 'visible';
    clearBtn.style.visibility = 'visible';
    spacer.style.visibility = 'visible';
    settingsContent.style.display = 'none';
    
    // 重新渲染列表
    const allItems = getSortedItems();
    if (allItems.length === 0) {
      itemsList.style.display = 'none';
      emptyState.style.display = 'block';
    } else {
      itemsList.style.display = 'flex';
      emptyState.style.display = 'none';
      clearElement(itemsList);
      
      allItems.forEach((item, index) => {
        const element = item.type === 'tab' 
          ? createTabElement(item.data, index) 
          : createWorkspaceElement(item.data, item.color, index);
        itemsList.appendChild(element);
      });
      
      attachEventListeners(allItems);
    }
  }
}

async function handleStashWorkspace() {
  if (!isDataLoaded) return;
  try {
    await safeSendMessage({ action: 'stashWorkspace' });
    await loadData();
  } catch (e) { 
    console.error('handleStashWorkspace error:', e); 
  }
}

async function handleClearAll() {
  if (!isDataLoaded) return;
  if (confirm('确定要清空所有标签页和工作区吗？此操作不可撤销。')) {
    try {
      await safeSendMessage({ action: 'clearAll' });
      await loadData();
    } catch (e) { 
      console.error('handleClearAll error:', e); 
    }
  }
}

async function updateSortOrder(order) {
  settings.sortOrder = order;
  try {
    await safeSendMessage({ action: 'saveSettings', settings });
    // 如果当前不在设置页面，立即刷新列表
    if (!isSettingsVisible) {
      await loadData();
    }
  } catch (e) { 
    console.error('updateSortOrder error:', e); 
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadSettings(), loadData()]);
  
  document.getElementById('stashWorkspaceBtn').addEventListener('click', handleStashWorkspace);
  document.getElementById('clearAllBtn').addEventListener('click', handleClearAll);
  document.getElementById('settingsBtn').addEventListener('click', toggleSettings);
  
  document.getElementById('themeToggle').addEventListener('click', async () => {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    document.getElementById('themeToggle').classList.toggle('active', settings.theme === 'dark');
    applyTheme(settings.theme);
    try { 
      await safeSendMessage({ action: 'saveSettings', settings }); 
    } catch (e) { 
      console.error(e); 
    }
  });

  document.getElementById('closeAfterStashToggle').addEventListener('click', async () => {
    settings.closeAfterStash = !settings.closeAfterStash;
    document.getElementById('closeAfterStashToggle').classList.toggle('active', settings.closeAfterStash);
    document.getElementById('newTabAfterStashItem').style.display = settings.closeAfterStash ? 'flex' : 'none';
    try { 
      await safeSendMessage({ action: 'saveSettings', settings }); 
    } catch (e) { 
      console.error(e); 
    }
  });

  document.getElementById('newTabAfterStashToggle').addEventListener('click', async () => {
    settings.newTabAfterStash = !settings.newTabAfterStash;
    document.getElementById('newTabAfterStashToggle').classList.toggle('active', settings.newTabAfterStash);
    try { 
      await safeSendMessage({ action: 'saveSettings', settings }); 
    } catch (e) { 
      console.error(e); 
    }
  });

  document.getElementById('removeAfterOpenToggle').addEventListener('click', async () => {
    settings.removeAfterOpen = !settings.removeAfterOpen;
    document.getElementById('removeAfterOpenToggle').classList.toggle('active', settings.removeAfterOpen);
    try { 
      await safeSendMessage({ action: 'saveSettings', settings }); 
    } catch (e) { 
      console.error(e); 
    }
  });
  
  // 排序开关事件
  document.getElementById('sortOrderToggle').addEventListener('click', async () => {
    const newOrder = settings.sortOrder === 'asc' ? 'desc' : 'asc';
    await updateSortOrder(newOrder);
    // 更新开关的视觉状态
    document.getElementById('sortOrderToggle').classList.toggle('active', newOrder === 'asc');
  });
});