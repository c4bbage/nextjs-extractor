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
});

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
