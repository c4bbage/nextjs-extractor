// 初始化标志，防止多次注入
if (typeof window.nextJsExtractorInitialized === 'undefined') {
  window.nextJsExtractorInitialized = true;
  
  // Content script loaded indicator
  console.log('Next.js Extractor content script loaded');
  
  // 检测框架类型并提取路由信息
  detectFramework();
  
  // 监听来自popup的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Content script received message:', request);
    
    // ping/pong机制，确认content script是否活跃
    if (request.action === 'ping') {
      console.log('Received ping, sending pong');
      sendResponse({status: 'pong'});
      return true;
    }
    
    // 重新检测框架
    if (request.action === 'detectFramework') {
      console.log('Re-detecting framework');
      detectFramework();
      sendResponse({status: 'detecting'});
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
  
  // 检测前端框架类型并提取路由信息
  function detectFramework() {
    console.log('Detecting framework...');
    
    // 使用Chrome API在页面上下文中执行检测代码，而不是注入内联脚本
    chrome.runtime.sendMessage({
      type: 'detect_framework_in_page'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('Error requesting framework detection:', chrome.runtime.lastError);
      } else {
        console.log('Framework detection request sent successfully');
      }
    });
  }
  
  // 递归查找Vue路由
  function recursiveFindRouterWithPush(obj, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) {
      return null;
    }
    
    for (const key in obj) {
      try {
        if (key === '$router' && obj[key] !== null && 
            typeof obj[key] === 'object' && 
            typeof obj[key].beforeEach === 'function') {
          return obj[key];
        }
      } catch (error) {
        // 忽略访问属性时的错误
      }
      
      try {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const foundInSubObject = recursiveFindRouterWithPush(obj[key], depth + 1, maxDepth);
          if (foundInSubObject) {
            return foundInSubObject;
          }
        }
      } catch (error) {
        // 忽略访问属性时的错误
      }
    }
    
    return null;
  }
  
  // 递归提取路由路径
  function extractRoutesRecursively(routes, parentPath = '') {
    let result = [];
    
    if (!Array.isArray(routes)) {
      return result;
    }
    
    for (const route of routes) {
      if (!route) continue;
      
      const currentPath = route.path ? 
        (route.path.startsWith('/') ? route.path : `${parentPath}/${route.path}`) : parentPath;
      
      result.push({
        path: currentPath,
        name: route.name,
        meta: route.meta
      });
      
      if (route.children && Array.isArray(route.children)) {
        result = result.concat(extractRoutesRecursively(route.children, currentPath));
      }
    }
    
    return result;
  }
  
  // 在页面上执行的检测代码 - 这段代码不再内联执行，而是通过executeScript API执行
  // 保留这个函数定义以供background script使用
  function pageDetectionCode() {
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
        // 尝试获取Vue路由
        try {
          result.router = extractVueRouter();
        } catch (e) {
          console.error('Error extracting Vue router:', e);
        }
        return result;
      }
      
      // 方法2: 检查DOM元素上的 __vue__ 或 __vue_app__
      const vueElements = document.querySelectorAll('*');
      for (const el of vueElements) {
        if (el.__vue__ || el.__vue_app__) {
          result.framework = 'vue';
          // 尝试获取Vue路由
          try {
            result.router = extractVueRouter();
          } catch (e) {
            console.error('Error extracting Vue router:', e);
          }
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
    
    // 提取Vue路由信息
    function extractVueRouter() {
      const routerInfo = {
        paths: []
      };
      
      // 尝试不同的Vue路由获取方法
      // 1. 直接从window中获取
      let vueRouter = window.$router;
      
      // 2. 从应用程序实例获取
      if (!vueRouter) {
        const appElement = document.querySelector('div');
        if (appElement && appElement.__vue_app__) {
          vueRouter = appElement.__vue_app__.config.globalProperties.$router || 
                      appElement.__vue_app__.$router;
        }
      }
      
      // 3. 如果前两种方法失败，使用递归查找 (有性能风险，限制深度)
      if (!vueRouter) {
        // 简化版递归查找，适用于页面环境
        function recursiveFindRouter(obj, depth = 0, maxDepth = 3) {
          if (depth > maxDepth) {
            return null;
          }
          
          for (const key in obj) {
            try {
              if (key === '$router' && obj[key] !== null && 
                  typeof obj[key] === 'object' && 
                  typeof obj[key].beforeEach === 'function') {
                return obj[key];
              }
            } catch (error) {
              // 忽略访问属性时的错误
            }
            
            try {
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                const foundInSubObject = recursiveFindRouter(obj[key], depth + 1, maxDepth);
                if (foundInSubObject) {
                  return foundInSubObject;
                }
              }
            } catch (error) {
              // 忽略访问属性时的错误
            }
          }
          
          return null;
        }
        
        vueRouter = recursiveFindRouter(window, 0, 3);
      }
      
      // 从路由器中提取路径
      if (vueRouter) {
        // 尝试通过getRoutes()获取
        if (typeof vueRouter.getRoutes === 'function') {
          try {
            const routes = vueRouter.getRoutes();
            routerInfo.paths = routes.map(route => ({
              path: route.path,
              name: route.name,
              meta: route.meta
            }));
          } catch (e) {
            console.error('Error getting routes via getRoutes():', e);
          }
        }
        
        // 如果上述方法失败，尝试从options.routes获取
        if (routerInfo.paths.length === 0 && vueRouter.options && vueRouter.options.routes) {
          try {
            // 简化版递归提取路由
            function extractPathsRecursively(routes, parentPath = '') {
              let result = [];
              
              if (!Array.isArray(routes)) {
                return result;
              }
              
              for (const route of routes) {
                if (!route) continue;
                
                const currentPath = route.path ? 
                  (route.path.startsWith('/') ? route.path : `${parentPath}/${route.path}`) : parentPath;
                
                result.push({
                  path: currentPath,
                  name: route.name,
                  meta: route.meta
                });
                
                if (route.children && Array.isArray(route.children)) {
                  result = result.concat(extractPathsRecursively(route.children, currentPath));
                }
              }
              
              return result;
            }
            
            routerInfo.paths = extractPathsRecursively(vueRouter.options.routes);
          } catch (e) {
            console.error('Error getting routes via options.routes:', e);
          }
        }
        
        // 尝试修改所有鉴权属性为false (仅记录，不实际修改)
        let authRoutesCount = 0;
        try {
          if (routerInfo.paths.length > 0) {
            routerInfo.paths.forEach(route => {
              if (route.meta) {
                for (let key in route.meta) {
                  if (key.includes('auth') && route.meta[key] === true) {
                    authRoutesCount++;
                  }
                }
              }
            });
            
            if (authRoutesCount > 0) {
              routerInfo.authRoutesCount = authRoutesCount;
            }
          }
        } catch (e) {
          console.error('Error checking auth properties:', e);
        }
      }
      
      return routerInfo;
    }
    
    return result;
  }
  
  // 设置消息监听，接收background script执行的检测结果
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'framework_detection_result') {
      console.log('Framework detection result received:', message.result);
      // 将检测结果发送给popup
      chrome.runtime.sendMessage({
        type: 'framework_detected',
        result: message.result
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error forwarding detection result to popup:', chrome.runtime.lastError);
        } else {
          console.log('Detection result forwarded to popup');
        }
      });
      sendResponse({status: 'received'});
    }
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
