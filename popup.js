document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractButton');
  const includeSourcemapsCheckbox = document.getElementById('includeSourcemaps');
  const progressContainer = document.getElementById('progressContainer');
  const progressValue = document.getElementById('progressValue');
  const statusText = document.getElementById('status');
  
  // 框架检测相关元素
  const detectedFrameworkElement = document.getElementById('detectedFramework');
  const routerContainer = document.getElementById('routerContainer');
  const routerToggle = document.getElementById('routerToggle');
  const routerContent = document.getElementById('routerContent');
  
  console.log('Popup initialized');
  
  // 初始化时检测框架
  detectFramework();
  
  // 路由信息折叠/展开
  routerToggle.addEventListener('click', function() {
    const isVisible = routerContent.style.display === 'block';
    routerContent.style.display = isVisible ? 'none' : 'block';
    routerToggle.textContent = isVisible ? '路由信息 ▶' : '路由信息 ▼';
  });
  
  extractButton.addEventListener('click', function() {
    console.log('Extract button clicked');
    progressContainer.style.display = 'block';
    extractButton.disabled = true;
    extractButton.textContent = 'Extracting...';
    statusText.textContent = 'Preparing...';
    
    // 先检查当前标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs.length) {
        statusText.textContent = 'Error: No active tab found';
        console.error('No active tab found');
        return;
      }
      
      const activeTab = tabs[0];
      console.log('Active tab:', activeTab.id, activeTab.url);
      
      // 先尝试直接发送消息到content script
      try {
        chrome.tabs.sendMessage(
          activeTab.id, 
          { action: 'ping' },
          function(response) {
            const error = chrome.runtime.lastError;
            if (error || !response) {
              console.log('Content script not ready, injecting script:', error);
              injectContentScript(activeTab);
            } else {
              console.log('Content script is ready, sending extract command');
              sendExtractCommand(activeTab);
            }
          }
        );
      } catch (e) {
        console.error('Error sending initial message:', e);
        injectContentScript(activeTab);
      }
    });
  });
  
  // 向页面注入content script
  function injectContentScript(tab) {
    console.log('Injecting content script into tab:', tab.id);
    statusText.textContent = 'Injecting extractor...';
    
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    })
    .then(() => {
      console.log('Script injection successful');
      // 等待脚本初始化
      setTimeout(() => {
        sendExtractCommand(tab);
        // 重新检测框架
        detectFramework();
      }, 500);
    })
    .catch(err => {
      console.error('Script injection failed:', err);
      statusText.textContent = 'Error: Could not inject script';
      extractButton.disabled = false;
      extractButton.textContent = 'Retry';
    });
  }
  
  // 发送提取命令
  function sendExtractCommand(tab) {
    console.log('Sending extract command to tab:', tab.id);
    statusText.textContent = 'Starting extraction...';
    
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: 'extract',
        includeSourcemaps: includeSourcemapsCheckbox.checked
      },
      function(response) {
        const error = chrome.runtime.lastError;
        if (error) {
          console.error('Error sending extract command:', error);
          statusText.textContent = `Error: ${error.message || 'Failed to connect to page'}`;
          extractButton.disabled = false;
          extractButton.textContent = 'Retry';
        } else {
          console.log('Extract command sent successfully', response);
        }
      }
    );
  }
  
  // 检测框架
  function detectFramework() {
    // 重置框架检测相关UI
    detectedFrameworkElement.textContent = '检测中...';
    detectedFrameworkElement.className = '';
    routerContainer.style.display = 'none';
    routerContent.style.display = 'none';
    routerContent.textContent = '';
    routerToggle.textContent = '路由信息 ▶';
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs || !tabs.length) {
        detectedFrameworkElement.textContent = '无法检测';
        console.error('No active tab found for framework detection');
        return;
      }
      
      const activeTab = tabs[0];
      
      // 先尝试从storage中获取已保存的检测结果
      chrome.storage.local.get([`framework_${activeTab.id}`], function(result) {
        const savedResult = result[`framework_${activeTab.id}`];
        
        if (savedResult) {
          // 如果已经有保存的检测结果，直接显示
          console.log('Using saved framework detection result:', savedResult);
          displayFrameworkInfo(savedResult);
          return;
        }
        
        // 如果没有保存的结果，发送检测请求
        // 先尝试直接发送消息到content script
        try {
          chrome.tabs.sendMessage(
            activeTab.id, 
            { action: 'detectFramework' },
            function(response) {
              const error = chrome.runtime.lastError;
              if (error || !response) {
                console.log('Content script not ready for framework detection, injecting script:', error);
                injectContentScript(activeTab);
              } else {
                console.log('Framework detection initiated');
              }
            }
          );
        } catch (e) {
          console.error('Error sending detectFramework message:', e);
          injectContentScript(activeTab);
        }
      });
    });
  }
  
  // 显示框架检测结果
  function displayFrameworkInfo(result) {
    if (!result || result.error) {
      detectedFrameworkElement.textContent = '无法检测 ' + (result?.error ? `(${result.error})` : '');
      detectedFrameworkElement.className = 'framework-badge unknown-badge';
      return;
    }
    
    const framework = result.framework || 'unknown';
    let frameworkName = '未知';
    let badgeClass = 'unknown-badge';
    
    switch (framework) {
      case 'vue':
        frameworkName = 'Vue.js';
        badgeClass = 'vue-badge';
        break;
      case 'react':
        frameworkName = 'React';
        badgeClass = 'react-badge';
        break;
      case 'nextjs':
        frameworkName = 'Next.js';
        badgeClass = 'nextjs-badge';
        break;
      case 'angular':
        frameworkName = 'Angular';
        badgeClass = 'angular-badge';
        break;
    }
    
    detectedFrameworkElement.textContent = frameworkName;
    detectedFrameworkElement.className = 'framework-badge ' + badgeClass;
    
    // 显示路由信息（如果有）
    if (result.router && (
        (result.router.paths && result.router.paths.length > 0) || 
        (result.router.buildId && result.router.currentPage)
    )) {
      routerContainer.style.display = 'block';
      
      if (framework === 'vue' && result.router.paths) {
        // Vue 路由
        routerContent.innerHTML = '';
        result.router.paths.forEach(route => {
          const pathItem = document.createElement('div');
          pathItem.className = 'path-item';
          
          let pathText = `${route.path}`;
          if (route.name) {
            pathText += ` (${route.name})`;
          }
          
          // 如果有鉴权属性，高亮显示
          if (route.meta) {
            for (let key in route.meta) {
              if (key.includes('auth') && route.meta[key] === true) {
                pathText += ` <span style="color:red">[需要鉴权: ${key}]</span>`;
                break;
              }
            }
          }
          
          pathItem.innerHTML = pathText;
          routerContent.appendChild(pathItem);
        });
        
        // 如果有鉴权路由，添加解除鉴权提示
        if (result.router.authRoutesCount && result.router.authRoutesCount > 0) {
          const authNote = document.createElement('div');
          authNote.style.marginTop = '8px';
          authNote.style.color = '#4285f4';
          authNote.innerHTML = `发现 ${result.router.authRoutesCount} 个需要鉴权的路由<br>在控制台执行以下代码可以尝试解除鉴权：<br><code>$router.getRoutes().forEach(route => { for (let key in route.meta) { if (key.includes('auth') && route.meta[key] === true) { route.meta[key] = false; } } })</code>`;
          routerContent.appendChild(authNote);
        }
      } else if (framework === 'nextjs' && result.router) {
        // Next.js 路由
        let nextjsRouterInfo = `当前页面: ${result.router.currentPage}\n构建ID: ${result.router.buildId}\n`;
        
        if (result.router.pages && result.router.pages.length > 0) {
          nextjsRouterInfo += '\n页面路由:\n' + result.router.pages.join('\n');
        }
        
        routerContent.textContent = nextjsRouterInfo;
      }
    } else {
      routerContainer.style.display = 'none';
    }
  }
  
  // 监听消息更新进度
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Received message in popup:', message);
    
    if (message.type === 'progress') {
      progressValue.style.width = message.percent + '%';
      progressValue.textContent = message.percent + '%';
      statusText.textContent = message.status;
    } else if (message.type === 'complete') {
      progressValue.style.width = '100%';
      progressValue.textContent = '100%';
      statusText.textContent = 'Completed! ZIP package downloaded';
      extractButton.textContent = 'Completed';
    } else if (message.type === 'error') {
      statusText.textContent = 'Error: ' + message.error;
      extractButton.disabled = false;
      extractButton.textContent = 'Retry';
    } else if (message.type === 'framework_detected') {
      // 处理框架检测结果
      displayFrameworkInfo(message.result);
    }
    
    // 确保消息响应
    sendResponse({received: true});
    return true; // 保持消息通道开放
  });
});
