document.addEventListener('DOMContentLoaded', function() {
  const extractButton = document.getElementById('extractButton');
  const includeSourcemapsCheckbox = document.getElementById('includeSourcemaps');
  const progressContainer = document.getElementById('progressContainer');
  const progressValue = document.getElementById('progressValue');
  const statusText = document.getElementById('status');
  
  console.log('Popup initialized');
  
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
      setTimeout(() => sendExtractCommand(tab), 500);
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
    }
    
    // 确保消息响应
    sendResponse({received: true});
    return true; // 保持消息通道开放
  });
});
