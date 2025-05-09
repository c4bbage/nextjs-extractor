// @charset "UTF-8";
console.log('Background script loaded');

// 使用importScripts直接加载JSZip
try {
  console.log('Loading JSZip');
  self.importScripts('jszip.min.js');
  console.log('JSZip loaded successfully');
} catch (e) {
  console.error('Failed to load JSZip:', e);
}

// 设置默认图标
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
  updateBadge('?');
});

// 监听标签页更新，重置图标
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateBadge('?', tabId);
  }
});

// 监听消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('Background received message:', message.type, sender?.tab?.id);
  
  if (message.type === 'createZip') {
    console.log('Creating ZIP with', Object.keys(message.files).length, 'files');
    
    // 检查JSZip是否已加载
    if (typeof JSZip === 'undefined') {
      console.error('JSZip not loaded');
      sendResponse({status: 'error', error: 'JSZip not loaded'});
      return true;
    }
    
    // 创建并下载ZIP文件
    createAndDownloadZip(message.files, message.siteName)
      .then(() => {
        console.log('ZIP creation completed');
      })
      .catch(error => {
        console.error('ZIP creation failed:', error);
      });
    
    // 立即响应以避免连接丢失
    sendResponse({status: 'processing'});
    return true; // 保持通道开放
  }
  
  // 处理框架检测请求
  if (message.type === 'detect_framework_in_page') {
    const tabId = sender.tab?.id;
    if (tabId) {
      console.log('Executing framework detection in tab:', tabId);
      
      // 使用executeScript在页面上下文中执行检测代码
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        function: detectFrameworkInPage
      })
      .then((results) => {
        if (results && results[0] && results[0].result) {
          const detectionResult = results[0].result;
          console.log('Framework detection result:', detectionResult);
          
          // 立即更新扩展图标
          const framework = detectionResult.framework || 'unknown';
          updateBadge(getFrameworkBadge(framework), tabId);
          
          // 保存检测结果到storage以便popup打开时可以获取
          chrome.storage.local.set({
            [`framework_${tabId}`]: detectionResult
          }, function() {
            console.log('Framework detection result saved for tab:', tabId);
          });
          
          // 将结果发送回content script
          chrome.tabs.sendMessage(tabId, {
            type: 'framework_detection_result',
            result: detectionResult
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('Error sending detection result to content script:', chrome.runtime.lastError);
            } else {
              console.log('Detection result sent to content script:', response);
            }
          });
        }
      })
      .catch((error) => {
        console.error('Error executing script:', error);
        // 发送错误消息回content script
        chrome.tabs.sendMessage(tabId, {
          type: 'framework_detection_result', 
          result: { error: error.message || 'Failed to execute detection script' }
        });
      });
    }
    sendResponse({status: 'detecting'});
    return true;
  }
  
  // 处理框架检测结果，更新扩展图标
  if (message.type === 'framework_detected' && message.result) {
    const tabId = sender.tab?.id;
    if (tabId) {
      const framework = message.result.framework || 'unknown';
      updateBadge(getFrameworkBadge(framework), tabId);
    }
    sendResponse({status: 'badge_updated'});
    return true;
  }
});

// 在页面上下文中检测框架的函数
function detectFrameworkInPage() {
  const result = {
    framework: null,
    router: null
  };
  
  try {
    // 检测 Next.js
    if (typeof window.__NEXT_DATA__ !== 'undefined') {
      result.framework = 'nextjs';
      // 尝试提取 Next.js 的路由信息
      try {
        if (window.__NEXT_DATA__.buildId && window.__NEXT_DATA__.page) {
          result.router = {
            buildId: window.__NEXT_DATA__.buildId,
            currentPage: window.__NEXT_DATA__.page,
            pages: window.__NEXT_DATA__.pages || []
          };
        }
      } catch (e) {
        console.error('Error extracting Next.js router info:', e);
      }
      return result;
    }
    
    // 检测 Next.js 方法2: 检查特定的 meta 和 script 标签
    if (!!document.querySelector('meta[name="next-head"]')) {
      result.framework = 'nextjs';
      return result;
    }
    
    const nextScripts = Array.from(document.querySelectorAll('script[src^="/_next/"]'));
    if (nextScripts.length > 0) {
      result.framework = 'nextjs';
      return result;
    }
    
    // 检测 Vue
    // 方法1: 检查全局变量
    if (typeof window.__VUE__ !== 'undefined' || typeof window.Vue !== 'undefined') {
      result.framework = 'vue';
      // 尝试获取Vue路由信息会在这里添加
      // 简化处理，不提取路由以避免复杂性
      return result;
    }
    
    // 方法2: 检查DOM元素上的 __vue__ 或 __vue_app__
    const vueElements = document.querySelectorAll('*');
    for (const el of vueElements) {
      if (el.__vue__ || el.__vue_app__) {
        result.framework = 'vue';
        return result;
      }
    }
    
    // 检测 React (如果没有检测到 Next.js)
    // 方法1: 检查 React 相关的全局变量
    if (typeof window.__REACT__ !== 'undefined' || 
        typeof window.React !== 'undefined' || 
        typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined') {
      result.framework = 'react';
      return result;
    }
    
    // 方法2: 检查 DOM 元素上的 React 属性
    const rootElement = document.getElementById('root') || document.querySelector('*');
    if (rootElement) {
      for (const key in rootElement) {
        if (key.startsWith('__react') || key.startsWith('__reactFiber$')) {
          result.framework = 'react';
          return result;
        }
      }
    }
    
    // 检测 Angular
    if (window.angular || window.ng) {
      result.framework = 'angular';
      return result;
    }
    
    if (document && document.querySelector('[ng-version]')) {
      result.framework = 'angular';
      return result;
    }
  } catch (e) {
    console.error('Framework detection error:', e);
  }
  
  return result;
}

// 获取框架对应的标识
function getFrameworkBadge(framework) {
  switch (framework) {
    case 'vue':
      return 'Vue';
    case 'react':
      return 'R';
    case 'nextjs':
      return 'N.js';
    case 'angular':
      return 'Ang';
    default:
      return '?';
  }
}

// 更新扩展图标上的徽章
function updateBadge(text, tabId = null) {
  const action = {
    text: { text }
  };
  
  // 设置徽章文本
  if (tabId) {
    chrome.action.setBadgeText({...action.text, tabId});
  } else {
    chrome.action.setBadgeText(action.text);
  }
  
  // 根据框架类型设置徽章颜色
  let color = '#888888'; // 默认灰色
  
  switch (text) {
    case 'Vue':
      color = '#42b883'; // Vue绿色
      break;
    case 'R':
      color = '#61dafb'; // React蓝色
      break;
    case 'N.js':
      color = '#000000'; // Next.js黑色
      break;
    case 'Ang':
      color = '#dd0031'; // Angular红色
      break;
  }
  
  // 设置徽章背景色
  if (tabId) {
    chrome.action.setBadgeBackgroundColor({color, tabId});
  } else {
    chrome.action.setBadgeBackgroundColor({color});
  }
}

// 创建并下载ZIP文件
async function createAndDownloadZip(files, siteName) {
  try {
    console.log('Starting ZIP creation');
    const zip = new JSZip();
    
    // 添加文件到ZIP
    let fileCount = 0;
    for (const [filePath, content] of Object.entries(files)) {
      // 去除开头斜杠
      const normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
      zip.file(normalizedPath, content);
      fileCount++;
      
      // 每100个文件记录一次进度
      if (fileCount % 100 === 0) {
        console.log(`Added ${fileCount} files to ZIP`);
      }
    }
    
    console.log(`Added all ${fileCount} files to ZIP, generating blob`);
    
    // 生成ZIP文件
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 } // 平衡速度和大小
    });
    
    console.log('ZIP blob generated, size:', (zipBlob.size / 1024 / 1024).toFixed(2), 'MB');
    
    // 生成文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${siteName}-nextjs-source-${timestamp}.zip`;
    
    // 下载ZIP文件 - 在Service Worker中不能使用URL.createObjectURL
    console.log('Initiating download:', filename);
    
    // 使用Data URL替代Object URL (仅适用于小型文件)
    if (zipBlob.size < 10 * 1024 * 1024) { // 小于10MB的文件
      // 读取blob为Data URL
      const reader = new FileReader();
      reader.onload = function() {
        const dataUrl = reader.result;
        console.log('Data URL created, length:', dataUrl.length);
        
        // 使用Data URL下载
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, downloadId => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError);
          } else {
            console.log('Download started with ID:', downloadId);
            
            // 通知完成
            chrome.runtime.sendMessage({
              type: 'complete'
            }, response => {
              if (chrome.runtime.lastError) {
                console.error('Failed to send complete message:', chrome.runtime.lastError);
              }
            });
          }
        });
      };
      
      reader.onerror = function(error) {
        console.error('Error creating Data URL:', error);
        throw new Error('Failed to create Data URL: ' + error);
      };
      
      // 开始读取Blob
      reader.readAsDataURL(zipBlob);
    } else {
      // 对于大文件，使用分块下载或告知用户文件太大
      console.warn('File too large for Data URL method (>10MB):', zipBlob.size);
      
      // 通知用户文件过大
      chrome.runtime.sendMessage({
        type: 'error',
        error: `ZIP file is too large (${(zipBlob.size / 1024 / 1024).toFixed(2)} MB). Try extracting fewer files.`
      });
    }
    
  } catch (error) {
    console.error('Error creating ZIP:', error);
    
    // 发送错误消息
    chrome.runtime.sendMessage({
      type: 'error',
      error: error.message || 'Unknown error creating ZIP'
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('Failed to send error message:', chrome.runtime.lastError);
      }
    });
    
    throw error; // 重新抛出错误以便调用者处理
  }
}
