// 初始化标志，防止多次注入
if (typeof window.nextJsExtractorInitialized === 'undefined') {
  window.nextJsExtractorInitialized = true;
  
  // Content script loaded indicator
  console.log('Next.js Extractor content script loaded');
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Content script received message:', request);
    
    // ping/pong机制，确认content script是否活跃
    if (request.action === 'ping') {
      console.log('Received ping, sending pong');
      sendResponse({status: 'pong'});
      return true;
    }
    
    // 提取文件
    if (request.action === 'extract') {
      console.log('Starting extraction with includeSourcemaps:', request.includeSourcemaps);
      // 立即回复，确认接收到消息
      sendResponse({status: 'started'});
      // 开始提取过程
      extractNextJsFiles(request.includeSourcemaps);
      return true; // 保持消息通道开放
    }
    
    // 默认响应
    sendResponse({status: 'unknown_command'});
    return true;
  });
  
  async function extractNextJsFiles(includeSourcemaps) {
    try {
      console.log('Extraction process started');
      
      // 发送进度更新
      sendProgressUpdate(5, 'Finding Next.js files...');
      
      // 收集所有Next.js相关路径
      const nextJsPaths = await collectNextJsPaths();
      console.log('Found Next.js paths:', nextJsPaths.size, Array.from(nextJsPaths).slice(0, 3));
      
      if (nextJsPaths.size === 0) {
        sendErrorMessage('No Next.js files found on this page');
        return;
      }
      
      // 更新进度
      sendProgressUpdate(20, `Found ${nextJsPaths.size} files, preparing to download...`);
      
      // 准备下载
      const fileUrls = prepareFileUrls(nextJsPaths, includeSourcemaps);
      console.log('Starting download of', fileUrls.length, 'files');
      
      // 下载文件
      const fileContents = await downloadFiles(fileUrls);
      
      // 如果没有成功下载任何文件
      if (Object.keys(fileContents).length === 0) {
        sendErrorMessage('Failed to download any files');
        return;
      }
      
      console.log('All downloads completed, creating ZIP');
      
      // 更新进度
      sendProgressUpdate(80, 'Creating ZIP file...');
      
      // 发送文件到background script处理zip
      chrome.runtime.sendMessage({
        type: 'createZip',
        files: fileContents,
        siteName: window.location.hostname
      }, response => {
        console.log('CreateZip response:', response);
        const error = chrome.runtime.lastError;
        if (error) {
          console.error('Error sending files to background:', error);
          sendErrorMessage('Error creating ZIP: ' + error.message);
        }
      });
      
    } catch (error) {
      console.error('Error while extracting files:', error);
      sendErrorMessage(error.message || 'Unknown error during extraction');
    }
  }
  
  // 收集所有Next.js路径
  async function collectNextJsPaths() {
    const nextJsPaths = new Set();
    
    // 从script标签提取
    const scriptTags = Array.from(document.querySelectorAll('script[src]'));
    scriptTags.forEach(script => {
      const src = script.getAttribute('src');
      if (src && src.includes('/_next/')) {
        nextJsPaths.add(src);
      }
    });
    
    // 从link preload标签提取
    const linkTags = Array.from(document.querySelectorAll('link[rel="preload"][as="script"]'));
    linkTags.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href.includes('/_next/')) {
        nextJsPaths.add(href);
      }
    });
    
    // 从HTML源代码中查找更多JS引用
    const htmlContent = document.documentElement.outerHTML;
    const jsRegex = /\/_next\/static\/[^"'\s]+\.js/g;
    let match;
    while ((match = jsRegex.exec(htmlContent)) !== null) {
      nextJsPaths.add(match[0]);
    }
    
    return nextJsPaths;
  }
  
  // 准备文件URL列表
  function prepareFileUrls(nextJsPaths, includeSourcemaps) {
    const origin = window.location.origin;
    const fileUrls = [];
    
    nextJsPaths.forEach(path => {
      // 添加JS文件
      const fullJsUrl = path.startsWith('http') ? path : `${origin}${path}`;
      fileUrls.push({ url: fullJsUrl, path: path });
      
      // 添加sourcemap文件
      if (includeSourcemaps) {
        const mapUrl = `${fullJsUrl}.map`;
        fileUrls.push({ url: mapUrl, path: `${path}.map` });
      }
    });
    
    return fileUrls;
  }
  
  // 下载所有文件
  async function downloadFiles(fileUrls) {
    const fileContents = {};
    let completedFiles = 0;
    const totalFiles = fileUrls.length;
    
    for (const fileInfo of fileUrls) {
      try {
        console.log('Fetching:', fileInfo.url.substring(0, 100) + '...');
        const response = await fetch(fileInfo.url);
        
        if (response.ok) {
          const content = await response.text();
          fileContents[fileInfo.path] = content;
          console.log('Successfully downloaded:', fileInfo.path);
        } else {
          console.warn('Failed to fetch with status:', response.status, fileInfo.url);
        }
        
        completedFiles++;
        const progressPercent = 20 + Math.floor((completedFiles / totalFiles) * 60);
        
        sendProgressUpdate(
          progressPercent, 
          `Downloading: ${completedFiles}/${totalFiles}`
        );
        
      } catch (err) {
        console.error(`Download failed ${fileInfo.url}:`, err);
        // 继续尝试下载其他文件
      }
    }
    
    return fileContents;
  }
  
  // 发送进度更新
  function sendProgressUpdate(percent, status) {
    chrome.runtime.sendMessage({
      type: 'progress',
      percent: percent,
      status: status
    }, response => {
      const error = chrome.runtime.lastError;
      if (error) console.error('Error sending progress update:', error);
    });
  }
  
  // 发送错误消息
  function sendErrorMessage(errorMsg) {
    chrome.runtime.sendMessage({
      type: 'error',
      error: errorMsg
    }, response => {
      const error = chrome.runtime.lastError;
      if (error) console.error('Error sending error message:', error);
    });
  }
}
